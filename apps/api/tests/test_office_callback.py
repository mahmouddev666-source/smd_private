"""T3-12: callback state machine, dedupe/conflict versioning and SSRF."""

from datetime import datetime, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.form import FormFileVersion
from app.models.user import User
from app.services import office_callback, office_tokens, sessions, versions
from tests.conftest import login
from tests.office_helpers import DS_SECRET, docx_bytes, make_file, office_on, user  # noqa: F401

DS_URL = "http://onlyoffice/cache/files/saved.docx"


def _setup(db: Session, data: bytes | None = None):
    file, version = make_file(db, data=data)
    actor = user(db, "admin")
    session = sessions.open_session(db, file, version, actor)
    t2 = office_tokens.issue_callback_token(
        file_id=file.id, session_id=session.id, user_id=actor.id
    )
    return file, version, session, t2


def _t3(file, version, status: int, **extra) -> str:
    payload = {
        "key": sessions.document_key(file.id, version.id),
        "status": status,
        **extra,
    }
    return jwt.encode(payload, DS_SECRET, algorithm="HS256")


def _post(client: TestClient, file, t2: str, t3: str, status: int, **extra):
    body = {"token": t3, "status": status, **extra}
    return client.post(f"/api/office/callback/{file.id}?token={t2}", json=body)


def _version_count(db: Session, file_id: str) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(FormFileVersion).where(FormFileVersion.file_id == file_id)
        )
        or 0
    )


def test_status_1_touches_the_session(client: TestClient, db: Session, office_on) -> None:
    file, version, session, t2 = _setup(db)
    before = session.last_seen_at
    response = _post(client, file, t2, _t3(file, version, 1), 1)
    assert response.status_code == 200, response.text
    assert response.json() == {"error": 0}
    assert response.headers["cache-control"] == "no-store"
    db.refresh(session)
    assert session.last_seen_at >= before
    assert session.closed_at is None


def test_status_2_saves_a_new_version_and_closes(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)
    saved = docx_bytes(b"saved-content")
    monkeypatch.setattr(office_callback, "fetch_document", lambda url: saved)

    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"error": 0}

    assert _version_count(db, file.id) == 2
    new = versions.get_version(
        db, file, versions.list_versions(db, file)[-1].id
    )
    assert new.version_no == 2
    assert new.source == "onlyoffice"
    assert new.parent_version_id == version.id
    assert new.checksum == versions.checksum_of(saved)
    assert file.current_version_id == new.id
    db.refresh(session)
    assert session.closed_at is not None
    assert session.close_reason == "saved"


def test_status_6_forcesave_keeps_the_session_open(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)
    monkeypatch.setattr(
        office_callback, "fetch_document", lambda url: docx_bytes(b"autosave")
    )
    response = _post(
        client,
        file,
        t2,
        _t3(file, version, 6, url=DS_URL, filetype="docx", forcesavetype=1),
        6,
        url=DS_URL,
        filetype="docx",
        forcesavetype=1,
    )
    assert response.status_code == 200, response.text
    assert _version_count(db, file.id) == 2
    db.refresh(session)
    assert session.closed_at is None


@pytest.mark.parametrize(
    ("status", "reason"),
    [(3, "saved_with_error"), (4, "no_changes")],
)
def test_error_and_no_change_statuses_close_without_saving(
    client: TestClient, db: Session, office_on, status: int, reason: str
) -> None:
    file, version, session, t2 = _setup(db)
    response = _post(client, file, t2, _t3(file, version, status), status)
    assert response.status_code == 200, response.text
    assert response.json() == {"error": 0}
    assert _version_count(db, file.id) == 1
    db.refresh(session)
    assert session.close_reason == reason


def test_status_7_audits_without_closing(client: TestClient, db: Session, office_on) -> None:
    file, version, session, t2 = _setup(db)
    response = _post(client, file, t2, _t3(file, version, 7, error=4), 7, error=4)
    assert response.status_code == 200, response.text
    assert response.json() == {"error": 0}
    db.refresh(session)
    assert session.closed_at is None


def test_duplicate_save_creates_no_version(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    data = docx_bytes(b"same-bytes")
    file, version, session, t2 = _setup(db, data=data)
    monkeypatch.setattr(office_callback, "fetch_document", lambda url: data)

    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 200, response.text
    assert response.json() == {"error": 0}
    assert _version_count(db, file.id) == 1
    db.refresh(session)
    assert session.closed_at is None

    audit = db.scalar(select(func.count()).select_from(AuditLog))
    assert audit and audit > 0


def test_conflict_uses_the_opened_version_as_parent(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)
    # Someone else saved v2 while this session was still editing v1.
    versions.create_version(
        db, file, data=docx_bytes(b"other-user"), kind="word", extension="docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        source="onlyoffice", parent_id=version.id,
    )
    monkeypatch.setattr(
        office_callback, "fetch_document", lambda url: docx_bytes(b"stale-session")
    )
    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 200, response.text
    created = versions.list_versions(db, file)[-1]
    assert created.version_no == 3
    assert created.parent_version_id == version.id
    assert created.checksum != file.checksum or created.id != version.id


@pytest.mark.parametrize(
    "url",
    [
        "https://onlyoffice/cache/files/a.docx",
        "http://evil.example/cache/files/a.docx",
        "http://user:pass@onlyoffice/cache/files/a.docx",
        "http://onlyoffice:8080/cache/files/a.docx",
        "http://onlyoffice/downloads/a.docx",
        "http://onlyoffice/cache/files/a.docx#frag",
    ],
)
def test_ssrf_urls_are_rejected(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    file, version, session, t2 = _setup(db)
    monkeypatch.setattr(
        office_callback, "fetch_document", lambda _: pytest.fail("must not fetch")
    )
    response = _post(
        client, file, t2, _t3(file, version, 2, url=url, filetype="docx"), 2,
        url=url, filetype="docx",
    )
    assert response.status_code == 400
    assert response.json()["error"] == 1
    assert response.json()["code"] == "OFFICE_CALLBACK_URL_REJECTED"
    assert response.headers["cache-control"] == "no-store"
    assert _version_count(db, file.id) == 1


def test_wrong_content_type_is_rejected(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)
    monkeypatch.setattr(
        office_callback, "fetch_document", lambda url: b"\xd0\xcf\x11\xe0 legacy"
    )
    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 422
    assert response.json()["error"] == 1
    assert response.json()["code"] == "OFFICE_CONTENT_TYPE_MISMATCH"


def test_oversized_payload_is_rejected(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)
    monkeypatch.setattr(settings, "office_max_file_mb", 1)
    monkeypatch.setattr(
        office_callback, "fetch_document", lambda url: b"x" * (1024 * 1024 + 1)
    )
    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 413
    assert response.json()["error"] == 1
    assert response.json()["code"] == "OFFICE_CONTENT_TOO_LARGE"


@pytest.mark.parametrize("which", ["t2", "t3"])
def test_bad_tokens_return_error_1(
    client: TestClient, db: Session, office_on, which: str
) -> None:
    file, version, session, t2 = _setup(db)
    t3 = _t3(file, version, 1)
    if which == "t3":
        t3 = jwt.encode({"key": "x", "status": 1}, "wrong-secret", algorithm="HS256")
    else:
        t2 = t2[:-2] + "zz"
    response = _post(client, file, t2, t3, 1)
    assert response.status_code == 401
    assert response.json()["error"] == 1
    assert response.headers["cache-control"] == "no-store"


def test_unexpected_failure_never_returns_5xx(
    client: TestClient, db: Session, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    file, version, session, t2 = _setup(db)

    def explode(url):
        raise RuntimeError("DS exploded")

    monkeypatch.setattr(office_callback, "fetch_document", explode)
    response = _post(
        client, file, t2, _t3(file, version, 2, url=DS_URL, filetype="docx"), 2,
        url=DS_URL, filetype="docx",
    )
    assert response.status_code == 200
    assert response.json() == {"error": 1}


def test_wrong_key_is_rejected(client: TestClient, db: Session, office_on) -> None:
    file, version, session, t2 = _setup(db)
    t3 = jwt.encode({"key": "smd-wrong-key", "status": 1}, DS_SECRET, algorithm="HS256")
    response = _post(client, file, t2, t3, 1)
    assert response.status_code == 400
    assert response.json()["error"] == 1
    assert response.json()["code"] == "OFFICE_CALLBACK_PAYLOAD_INVALID"
