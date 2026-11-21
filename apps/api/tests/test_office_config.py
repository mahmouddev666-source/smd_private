"""T3-10: /api/office/config — roles, sessions, statuses and signed config."""

from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.form import OfficeSession
from app.services import office as office_service, sessions, versions
from app.utils.ids import new_id
from tests.conftest import login
from tests.office_helpers import DS_SECRET, docx_bytes, make_file, office_on, user  # noqa: F401


def _get(client: TestClient, file_id: str, headers: dict) :
    return client.get(f"/api/office/config/{file_id}", headers=headers)


def test_config_success_is_signed_and_keeps_a_stable_key(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db)
    response = _get(client, file.id, login(client))
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["documentServerUrl"] == "/onlyoffice"
    assert body["version"]["number"] == 1
    assert body["version"]["isOriginal"] is True

    config = body["config"]
    assert config["documentType"] == "word"
    assert config["document"]["key"] == f"smd-{file.id}-{version.id}"
    assert config["document"]["fileType"] == "docx"
    assert config["document"]["permissions"] == {
        "edit": True,
        "download": False,
        "print": True,
        "copy": True,
        "comment": False,
        "review": False,
        "fillForms": True,
    }
    assert config["editorConfig"]["mode"] == "edit"
    assert config["editorConfig"]["lang"] == "ar"
    assert "?token=" in config["document"]["url"]
    assert "?token=" in config["editorConfig"]["callbackUrl"]

    claims = jwt.decode(config["token"], DS_SECRET, algorithms=["HS256"])
    assert claims["document"]["key"] == config["document"]["key"]
    assert "token" not in claims

    second = _get(client, file.id, login(client))
    assert second.status_code == 200
    assert second.json()["config"]["document"]["key"] == config["document"]["key"]


def test_config_cell_type_for_excel(client: TestClient, db: Session, office_on) -> None:
    file, _ = make_file(db, kind="excel", extension="xlsx")
    response = _get(client, file.id, login(client))
    assert response.status_code == 200, response.text
    assert response.json()["config"]["documentType"] == "cell"


def test_config_role_matrix(client: TestClient, db: Session, office_on) -> None:
    # Sessions are exclusive per file: give each editor role its own file.
    for username in ("admin", "hr"):
        file, _ = make_file(db)
        assert _get(client, file.id, login(client, username)).status_code == 200
    guarded, _ = make_file(db)
    for username in ("supervisor", "viewer"):
        response = _get(client, guarded.id, login(client, username))
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"


def test_config_preconditions(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = login(client)
    pdf_file, _ = make_file(db, kind="pdf", extension="pdf")
    legacy_file, _ = make_file(db, extension="doc", data=b"\xd0\xcf\x11\xe0 legacy")

    assert _get(client, "missing-file", headers).json()["code"] == "FORM_FILE_NOT_FOUND"
    assert _get(client, pdf_file.id, headers).json()["code"] == "OFFICE_FORMAT_UNSUPPORTED"
    legacy = _get(client, legacy_file.id, headers)
    assert legacy.status_code == 422
    assert legacy.json()["code"] == "OFFICE_LEGACY_NOT_CONVERTED"

    monkeypatch.setattr(settings, "onlyoffice_enabled", False)
    disabled = _get(client, legacy_file.id, headers)
    assert disabled.status_code == 503
    assert disabled.json()["code"] == "OFFICE_DISABLED"


def test_active_session_blocks_another_user(client: TestClient, db: Session, office_on) -> None:
    file, version = make_file(db)
    assert _get(client, file.id, login(client, "hr")).status_code == 200

    conflict = _get(client, file.id, login(client, "admin"))
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "OFFICE_SESSION_ACTIVE"
    assert conflict.json()["owner"] == "Hr"


def test_expired_session_is_replaced(client: TestClient, db: Session, office_on) -> None:
    file, version = make_file(db)
    old = OfficeSession(
        id=new_id(),
        file_id=file.id,
        version_id=version.id,
        document_key=sessions.document_key(file.id, version.id),
        user_id=user(db, "hr").id,
        user_name="Hr",
        created_at=datetime.now(timezone.utc) - timedelta(hours=2),
        last_seen_at=datetime.now(timezone.utc) - timedelta(hours=2),
        expires_at=datetime.now(timezone.utc) - timedelta(hours=1),
    )
    db.add(old)
    db.commit()

    response = _get(client, file.id, login(client))
    assert response.status_code == 200, response.text
    db.refresh(old)
    assert old.closed_at is not None
    assert old.close_reason == "expired"
    active = sessions.get_active_session(db, file.id)
    assert active is not None and active.id != old.id
