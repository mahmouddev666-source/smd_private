"""T3-02 (R6): document writes are ADMIN/HR only; SUPERVISOR keeps read access."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from tests.conftest import login
from tests.test_forms import FIELDS, _create_template, _upload


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def _create_named_template(
    client: TestClient, headers: dict[str, str], file_id: str, name: str
):
    return client.post(
        "/api/forms/templates",
        json={
            "name": name,
            "category": "الإجازات",
            "description": "نموذج اختبار الصلاحيات",
            "file_id": file_id,
            "fields": FIELDS,
        },
        headers=headers,
    )


def test_supervisor_can_read_the_document_library(client: TestClient) -> None:
    admin = login(client)
    file_id = _upload(client, admin).json()["id"]
    _create_template(client, admin, file_id)

    supervisor = login(client, "supervisor")
    assert client.get("/api/forms/files", headers=supervisor).status_code == 200
    assert client.get("/api/forms/templates", headers=supervisor).status_code == 200
    assert client.get("/api/forms/submissions", headers=supervisor).status_code == 200
    assert client.get(f"/api/forms/files/{file_id}", headers=supervisor).status_code == 200


def test_supervisor_is_forbidden_from_every_document_write(client: TestClient) -> None:
    admin = login(client)
    file_id = _upload(client, admin).json()["id"]
    template = _create_template(client, admin, file_id).json()
    free_file_id = _upload(client, admin).json()["id"]

    supervisor = login(client, "supervisor")

    responses = [
        _upload(client, supervisor),
        client.delete(f"/api/forms/files/{free_file_id}", headers=supervisor),
        _create_template(client, supervisor, free_file_id),
        client.patch(
            f"/api/forms/templates/{template['id']}",
            json={"name": "اسم جديد"},
            headers=supervisor,
        ),
        client.delete(f"/api/forms/templates/{template['id']}", headers=supervisor),
        client.post(
            "/api/forms/submissions",
            json={"template_id": template["id"], "values": {"employee_name": "x"}},
            headers=supervisor,
        ),
    ]

    for response in responses:
        assert response.status_code == 403, response.text
        assert response.json()["code"] == "FORBIDDEN"


def test_admin_and_hr_can_still_write_documents(client: TestClient) -> None:
    for username in ("admin", "hr"):
        headers = login(client, username)

        uploaded = _upload(client, headers)
        assert uploaded.status_code == 201, uploaded.text
        file_id = uploaded.json()["id"]

        created = _create_named_template(
            client, headers, file_id, name=f"قالب {username}"
        )
        assert created.status_code == 201, created.text
        template_id = created.json()["id"]

        patched = client.patch(
            f"/api/forms/templates/{template_id}",
            json={"is_active": False},
            headers=headers,
        )
        assert patched.status_code == 200, patched.text

        assert (
            client.delete(f"/api/forms/templates/{template_id}", headers=headers).status_code
            == 204
        )
        assert (
            client.delete(f"/api/forms/files/{file_id}", headers=headers).status_code == 204
        )
