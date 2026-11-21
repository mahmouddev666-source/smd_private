"""T3-13: versions/preview/convert/close endpoints and the role matrix."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services import documents, sessions, versions
from tests.conftest import login
from tests.office_helpers import docx_bytes, make_file, office_on, user  # noqa: F401


def test_versions_metadata_is_readable_by_any_user_without_paths(
    client: TestClient, db: Session, office_on
) -> None:
    file, _ = make_file(db)
    for username in ("viewer", "supervisor", "admin"):
        response = client.get(
            f"/api/office/files/{file.id}/versions", headers=login(client, username)
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["total"] == 1
        item = body["items"][0]
        assert item["number"] == 1
        assert item["isOriginal"] is True
        assert "storage_path" not in item
        assert "storagePath" not in item
        assert response.headers["cache-control"] == "no-store"


def test_version_download_requires_editor_role_and_honours_disposition(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db)
    url = f"/api/office/files/{file.id}/versions/{version.id}/download"
    assert client.get(url, headers=login(client, "viewer")).status_code == 403
    assert client.get(url, headers=login(client, "supervisor")).status_code == 403

    admin = client.get(url, headers=login(client))
    assert admin.status_code == 200, admin.text
    assert "attachment" in admin.headers["content-disposition"]
    assert admin.headers["cache-control"] == "no-store"

    inline = client.get(url + "?disposition=inline", headers=login(client, "hr"))
    assert inline.status_code == 200
    assert "inline" in inline.headers["content-disposition"]


def test_version_preview_requires_a_ready_pdf(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db, pdf=True)
    url = f"/api/office/files/{file.id}/versions/{version.id}/preview"
    response = client.get(url, headers=login(client, "viewer"))
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF-")
    assert "inline" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"


def test_missing_preview_is_404_not_500(client: TestClient, db: Session, office_on) -> None:
    file, version = make_file(db)
    response = client.get(
        f"/api/office/files/{file.id}/versions/{version.id}/preview",
        headers=login(client, "viewer"),
    )
    assert response.status_code == 404
    assert response.json()["code"] == "PREVIEW_NOT_READY"


def test_convert_legacy_creates_a_new_current_version(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version = make_file(db, extension="doc", data=b"\xd0\xcf\x11\xe0 legacy")
    monkeypatch.setattr(documents, "convert_legacy", lambda source: docx_bytes(b"converted"))

    response = client.post(
        f"/api/office/files/{file.id}/convert", headers=login(client)
    )
    assert response.status_code == 202, response.text
    body = response.json()
    assert body["number"] == 2
    new = versions.get_version(db, file, body["versionId"])
    assert new.source == "conversion"
    assert new.parent_version_id == version.id
    assert file.current_version_id == new.id


def test_convert_rejects_already_ooxml_and_wrong_roles(
    client: TestClient, db: Session, office_on
) -> None:
    file, _ = make_file(db)
    url = f"/api/office/files/{file.id}/convert"
    assert client.post(url, headers=login(client, "supervisor")).status_code == 403
    response = client.post(url, headers=login(client))
    assert response.status_code == 409
    assert response.json()["code"] == "OFFICE_ALREADY_OOXML"


def test_force_close_session_is_editor_only_and_audited(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db)
    actor = user(db, "admin")
    session = sessions.open_session(db, file, version, actor)
    url = f"/api/office/files/{file.id}/sessions/close"

    assert client.post(url, json={"reason": "forced"}, headers=login(client, "viewer")).status_code == 403
    response = client.post(url, json={"reason": "forced"}, headers=login(client))
    assert response.status_code == 204, response.text
    assert response.headers["cache-control"] == "no-store"
    db.refresh(session)
    assert session.close_reason == "forced"
    assert session.closed_at is not None
