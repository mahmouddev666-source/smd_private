"""T3-11: /api/office/download — T2 + optional T3, no Bearer T1 needed."""

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings
from app.services import office_tokens
from tests.office_helpers import DS_SECRET, make_file, office_on  # noqa: F401


def _urls(file_id: str, version_id: str, t2: str) -> tuple[str, str]:
    path = f"/api/office/download/{file_id}?token={t2}"
    t3 = jwt.encode(
        {"operation": "download", "payload": {"url": f"http://api:8000{path}"}},
        DS_SECRET,
        algorithm="HS256",
    )
    return path, t3


def _t2(file_id: str, version_id: str, user_id: str = "u1") -> str:
    return office_tokens.issue_download_token(
        user_id=user_id, file_id=file_id, version_id=version_id
    )


def test_valid_download_streams_file_with_safe_headers(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db)
    t2 = _t2(file.id, version.id)
    path, t3 = _urls(file.id, version.id, t2)
    response = client.get(path, headers={"Authorization": f"Bearer {t3}"})
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"PK\x03\x04")
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "attachment" in response.headers["content-disposition"]
    assert f"v1.docx" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert settings.storage_dir not in response.text


@pytest.mark.parametrize("token_mode", ["none", "expired", "wrong_audience", "wrong_file"])
def test_bad_t2_tokens_are_401(
    client: TestClient, db: Session, office_on, token_mode: str
) -> None:
    file, version = make_file(db)
    valid = _t2(file.id, version.id)
    if token_mode == "none":
        token = ""
    elif token_mode == "expired":
        token = _t2(file.id, version.id)
        # tamper the signature while keeping the payload shape
        token = token[:-2] + "xx"
    elif token_mode == "wrong_audience":
        token = office_tokens.issue_callback_token(
            file_id=file.id, session_id="s1", user_id="u1"
        )
    else:
        token = _t2("another-file", version.id)
    path, t3 = _urls(file.id, version.id, token)
    response = client.get(path, headers={"Authorization": f"Bearer {t3}"})
    assert response.status_code == 401
    assert response.json()["code"] == "OFFICE_TOKEN_INVALID"
    assert response.headers["cache-control"] == "no-store"


def test_t3_download_token_is_enforced_when_required(
    client: TestClient, db: Session, office_on
) -> None:
    file, version = make_file(db)
    t2 = _t2(file.id, version.id)
    path, t3 = _urls(file.id, version.id, t2)

    missing = client.get(path)
    assert missing.status_code == 401
    assert missing.json()["code"] == "OFFICE_TOKEN_INVALID"

    wrong_operation = jwt.encode(
        {"operation": "callback", "payload": {"url": "http://api:8000" + path}},
        DS_SECRET,
        algorithm="HS256",
    )
    assert client.get(path, headers={"Authorization": f"Bearer {wrong_operation}"}).status_code == 401

    from app.core.config import settings as live_settings

    live_settings.office_require_ds_download_token = False
    try:
        assert client.get(path).status_code == 200
    finally:
        live_settings.office_require_ds_download_token = True


def test_version_must_belong_to_the_file(client: TestClient, db: Session, office_on) -> None:
    file, _ = make_file(db)
    other_file, other_version = make_file(db)
    token = _t2(file.id, other_version.id)
    path, t3 = _urls(file.id, other_version.id, token)
    response = client.get(path, headers={"Authorization": f"Bearer {t3}"})
    assert response.status_code == 404
    assert response.json()["code"] == "OFFICE_VERSION_NOT_FOUND"
    assert other_file.id != file.id
