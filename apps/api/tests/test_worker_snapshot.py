"""T3-16: worker-side snapshot retries — cap, audit, success and resilience."""

from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import worker
from app.core.config import settings
from app.models.audit import AuditLog
from app.models.form import FormSubmission
from app.services import forms as forms_service
from app.services import render
from tests.conftest import TestingSessionLocal
from tests.office_helpers import make_file, user


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))
    # The worker normally opens SessionLocal(); in tests it must use the same
    # in-memory engine as the fixtures instead of the unrelated app engine.
    monkeypatch.setattr(worker, "SessionLocal", TestingSessionLocal)


@pytest.fixture()
def pending_submission(db: Session) -> FormSubmission:
    file, version = make_file(db, kind="word", pdf=True)
    template = forms_service.create_template(
        db,
        forms_service.TemplateCreate(
            name="قالب إعادة المحاولة",
            file_id=file.id,
            fields=[
                {
                    "key": "employee_name",
                    "binding": "employee.name",
                    "label": "الاسم",
                    "page": 1,
                    "x": 5,
                    "y": 5,
                    "width": 50,
                    "height": 10,
                }
            ],
        ),
        user(db, "admin"),
    )
    submission = forms_service.create_submission(
        db,
        forms_service.SubmissionCreate(
            template_id=template.id, values={"employee_name": "أحمد"}
        ),
        user(db, "admin"),
    )
    return submission


def _fresh(db: Session, submission_id: str) -> FormSubmission:
    # The worker uses its own session; refresh the fixture's identity map.
    db.expire_all()
    return db.get(FormSubmission, submission_id)


def _actions(db: Session, submission_id: str) -> list[str]:
    return list(
        db.scalars(
            select(AuditLog.action).where(
                AuditLog.entity == "form_submission", AuditLog.entity_id == submission_id
            )
        ).all()
    )


def test_worker_retries_failed_snapshot_until_it_succeeds(
    db: Session, pending_submission: FormSubmission, monkeypatch: pytest.MonkeyPatch
) -> None:
    submission_id = pending_submission.id
    attempts = 0
    original = render.render_snapshot

    def flaky(db, submission):  # noqa: ANN001 - test double
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise render.SnapshotRenderError("فشل مؤقت في التخزين.", "SNAPSHOT_TEST")
        return original(db, submission)

    monkeypatch.setattr(render, "render_snapshot", flaky)

    for expected in (1, 2, 3):
        worker._snapshot_once()
        stored = _fresh(db, submission_id)
        assert stored.snapshot_attempts == expected
    stored = _fresh(db, submission_id)
    assert stored.snapshot_status == "ready"
    assert stored.rendered_pdf_path
    assert len(stored.rendered_checksum) == 64
    assert _actions(db, submission_id).count("forms.snapshot.failed") == 2
    assert _actions(db, submission_id).count("forms.snapshot.ready") == 1

    # A ready snapshot is not retried again by the worker.
    worker._snapshot_once()
    assert _fresh(db, submission_id).snapshot_attempts == 3


def test_worker_stops_after_the_attempt_cap(
    db: Session, pending_submission: FormSubmission, monkeypatch: pytest.MonkeyPatch
) -> None:
    submission_id = pending_submission.id

    def always_fails(db, submission):  # noqa: ANN001 - test double
        raise render.SnapshotRenderError("تعذّر توليد اللقطة.", "SNAPSHOT_TEST")

    monkeypatch.setattr(render, "render_snapshot", always_fails)

    for _ in range(5):
        worker._snapshot_once()

    stored = _fresh(db, submission_id)
    assert stored.snapshot_status == "failed"
    assert stored.snapshot_attempts == forms_service.SNAPSHOT_MAX_ATTEMPTS == 3
    assert stored.snapshot_error == "تعذّر توليد اللقطة."
    actions = _actions(db, submission_id)
    assert actions.count("forms.snapshot.failed") == 2
    assert actions.count("forms.snapshot.exhausted") == 1


def test_worker_skips_snapshots_when_the_flag_is_off(
    db: Session, pending_submission: FormSubmission, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "submission_snapshot_enabled", False)

    def unexpected(db, submission):  # noqa: ANN001 - test double
        raise AssertionError("snapshots must not run while disabled")

    monkeypatch.setattr(forms_service, "process_snapshot", unexpected)
    worker._snapshot_once()
    assert db.get(FormSubmission, pending_submission.id).snapshot_attempts == 0


def test_worker_stays_alive_when_one_render_raises_unexpectedly(
    db: Session, pending_submission: FormSubmission, monkeypatch: pytest.MonkeyPatch
) -> None:
    def explode(*args, **kwargs):  # noqa: ANN002, ANN003 - test double
        raise RuntimeError("unexpected crash")

    monkeypatch.setattr(forms_service, "process_snapshot", explode)
    worker._snapshot_once()  # must not propagate
    assert db.get(FormSubmission, pending_submission.id) is not None
