"""T3-15: background submission snapshots — API, statuses and access control."""

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import DOCUMENT_EDITOR_ROLES
from app.models.audit import AuditLog
from app.models.form import FormSubmission, FormTemplate
from app.schemas.form import SubmissionCreate, TemplateCreate
from app.services import forms as forms_service
from app.services import render
from tests.conftest import TestingSessionLocal, login
from tests.office_helpers import make_file, user


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


@pytest.fixture()
def template(db: Session):
    file, version = make_file(db, kind="word", pdf=True)
    record = forms_service.create_template(
        db,
        TemplateCreate(
            name="نموذج اللقطة",
            category="الإجازات",
            file_id=file.id,
            fields=[
                {
                    "key": "employee_name",
                    "binding": "employee.name",
                    "label": "الاسم",
                    "page": 1,
                    "x": 10,
                    "y": 20,
                    "width": 60,
                    "height": 10,
                    "font_size": 12,
                    "font_weight": "bold",
                    "align": "right",
                }
            ],
        ),
        user(db, "admin"),
    )
    return file, version, record


def _submit(client: TestClient, template_id: str, headers: dict[str, str]):
    return client.post(
        "/api/forms/submissions",
        json={
            "template_id": template_id,
            "values": {"employee_name": "أحمد محمد"},
        },
        headers=headers,
    )


def test_submission_is_saved_before_the_background_render(client: TestClient, db: Session, template) -> None:
    file, version, record = template
    headers = login(client)
    calls: list[str] = []

    def failing_render(db, submission):  # noqa: ANN001 - test double
        calls.append(submission.id)
        raise render.SnapshotRenderError("فشل توليد اللقطة لأغراض الاختبار.", "SNAPSHOT_TEST")

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(render, "render_snapshot", failing_render)
    try:
        response = _submit(client, record.id, headers)
    finally:
        monkeypatch.undo()

    # The save succeeds even though the background renderer failed.
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["document_version_id"] == version.id
    # The response is built before the background task runs: the save is never
    # delayed by rendering, and its failure never becomes an HTTP error.
    assert body["snapshot_status"] == "pending"
    assert body["snapshot_attempts"] == 0
    assert calls == [body["id"]]
    stored = db.get(FormSubmission, body["id"])
    assert stored is not None
    assert stored.snapshot_status == "failed"
    assert stored.snapshot_error == "فشل توليد اللقطة لأغراض الاختبار."
    assert stored.snapshot_attempts == 1
    actions = db.scalars(
        select(AuditLog.action).where(
            AuditLog.entity == "form_submission", AuditLog.entity_id == body["id"]
        )
    ).all()
    assert "create" in actions and "forms.snapshot.failed" in actions


def test_successful_background_snapshot_is_downloadable_with_no_store(client: TestClient, db: Session, template) -> None:
    _, _, record = template
    headers = login(client)

    created = _submit(client, record.id, headers)
    assert created.status_code == 201, created.text
    submission_id = created.json()["id"]

    detail = client.get(f"/api/forms/submissions/{submission_id}", headers=headers)
    assert detail.status_code == 200
    body = detail.json()
    assert body["snapshot_status"] == "ready"
    assert body["snapshot_attempts"] == 1
    assert len(body["rendered_checksum"]) == 64
    assert "storage" not in body and "rendered_pdf_path" not in body

    document = client.get(f"/api/forms/submissions/{submission_id}/document", headers=headers)
    assert document.status_code == 200
    assert document.content.startswith(b"%PDF-")
    assert document.headers["cache-control"] == "no-store"
    assert document.headers["x-content-type-options"] == "nosniff"
    assert "inline" in document.headers["content-disposition"]

    assert hashlib.sha256(document.content).hexdigest() == body["rendered_checksum"]
    assert db.get(FormSubmission, submission_id).snapshot_status == "ready"


def test_document_endpoint_returns_404_until_the_snapshot_is_ready(client: TestClient, template) -> None:
    _, _, record = template
    headers = login(client)
    with pytest.MonkeyPatch.context() as monkeypatch:
        monkeypatch.setattr(
            render,
            "render_snapshot",
            lambda db, submission: (_ for _ in ()).throw(
                render.SnapshotRenderError("تعذّر مؤقت.", "SNAPSHOT_TEST")
            ),
        )
        created = _submit(client, record.id, headers)
    assert created.status_code == 201

    document = client.get(f"/api/forms/submissions/{created.json()['id']}/document", headers=headers)
    assert document.status_code == 404
    assert document.json()["code"] == "SNAPSHOT_NOT_READY"


def test_snapshot_endpoint_requires_authentication(client: TestClient, template) -> None:
    _, _, record = template
    headers = login(client)
    created = _submit(client, record.id, headers)
    submission_id = created.json()["id"]

    assert client.get(f"/api/forms/submissions/{submission_id}").status_code == 401
    assert client.get(f"/api/forms/submissions/{submission_id}/document").status_code == 401
    assert client.get("/api/forms/submissions/missing", headers=headers).status_code == 404


def test_snapshot_role_matrix(client: TestClient, template) -> None:
    _, _, record = template
    headers = login(client)
    created = _submit(client, record.id, headers)
    submission_id = created.json()["id"]

    for role in DOCUMENT_EDITOR_ROLES:
        username = {"ADMIN": "admin", "HR": "hr"}[role]
        role_headers = login(client, username)
        assert _submit(client, record.id, role_headers).status_code == 201

    for username in ("supervisor", "viewer"):
        denied = _submit(client, record.id, login(client, username))
        assert denied.status_code == 403

    # Reading snapshots is available to every authenticated role.
    for username in ("admin", "hr", "supervisor", "viewer"):
        role_headers = login(client, username)
        assert client.get(f"/api/forms/submissions/{submission_id}", headers=role_headers).status_code == 200
        assert client.get(f"/api/forms/submissions/{submission_id}/document", headers=role_headers).status_code == 200


def test_snapshot_audit_trail_contains_the_successful_render(client: TestClient, db: Session, template) -> None:
    _, _, record = template
    created = _submit(client, record.id, login(client))
    submission_id = created.json()["id"]

    actions = db.scalars(
        select(AuditLog.action).where(
            AuditLog.entity == "form_submission", AuditLog.entity_id == submission_id
        )
    ).all()
    assert "create" in actions
    assert "forms.snapshot.ready" in actions


def test_background_render_survives_a_closed_request_session(db: Session, template) -> None:
    """FastAPI closes yield-dependencies before running background tasks."""
    _, _, record = template
    submission = forms_service.create_submission(
        db,
        SubmissionCreate(template_id=record.id, values={"employee_name": "أحمد"}),
        user(db, "admin"),
    )
    request_session = TestingSessionLocal()
    request_session.close()  # mimics FastAPI dependency teardown

    forms_service.process_snapshot(request_session, submission.id)

    db.expire_all()
    stored = db.get(FormSubmission, submission.id)
    assert stored.snapshot_status == "ready"
    assert stored.rendered_checksum
    request_session.close()


def test_version_pinned_download_and_template_pinning(client: TestClient, template) -> None:
    file, version, record = template
    assert record.document_version_id == version.id
    headers = login(client)

    pinned = client.get(
        f"/api/forms/files/{file.id}/download",
        params={"version_id": version.id},
        headers=headers,
    )
    assert pinned.status_code == 200
    assert pinned.content.startswith(b"%PDF-")
    assert f"_v{version.version_no}.pdf" in pinned.headers["content-disposition"]

    missing = client.get(
        f"/api/forms/files/{file.id}/download",
        params={"version_id": "missing-version"},
        headers=headers,
    )
    assert missing.status_code == 404
    assert missing.json()["code"] == "OFFICE_VERSION_NOT_FOUND"
