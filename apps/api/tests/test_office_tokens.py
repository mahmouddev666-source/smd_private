"""T3-07: T2 URL tokens — audience, file binding, expiry and HS256 only."""

import time

import jwt
import pytest

from app.core.config import settings
from app.core.errors import AppError
from app.services import office_tokens

SECRET = "a" * 32
FILE_ID = "file-123"
VERSION_ID = "version-456"
SESSION_ID = "session-789"


@pytest.fixture(autouse=True)
def office_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "office_token_secret", SECRET)
    monkeypatch.setattr(settings, "office_download_token_ttl_seconds", 600)
    monkeypatch.setattr(settings, "office_callback_token_ttl_seconds", 43200)


def _claims(token: str) -> dict:
    return jwt.decode(token, SECRET, algorithms=["HS256"], audience=None, options={"verify_aud": False})


def test_download_token_shape_and_default_ttl() -> None:
    token = office_tokens.issue_download_token(
        user_id="user-1", file_id=FILE_ID, version_id=VERSION_ID
    )
    claims = _claims(token)
    assert claims["aud"] == office_tokens.AUDIENCE_DOWNLOAD
    assert claims["typ"] == "office_url"
    assert claims["fid"] == FILE_ID
    assert claims["vid"] == VERSION_ID
    assert claims["sub"] == "user-1"
    assert claims["jti"]
    assert 590 <= claims["exp"] - claims["iat"] <= 600

    verified = office_tokens.verify_token(
        token, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID
    )
    assert verified["vid"] == VERSION_ID


def test_callback_token_shape_and_default_ttl() -> None:
    token = office_tokens.issue_callback_token(
        file_id=FILE_ID, session_id=SESSION_ID, user_id="user-1"
    )
    claims = _claims(token)
    assert claims["aud"] == office_tokens.AUDIENCE_CALLBACK
    assert claims["sid"] == SESSION_ID
    assert claims["exp"] - claims["iat"] == 43200
    assert "vid" not in claims
    assert office_tokens.verify_token(
        token, audience=office_tokens.AUDIENCE_CALLBACK, file_id=FILE_ID
    )["sid"] == SESSION_ID


@pytest.mark.parametrize(
    ("issue_kwargs", "audience"),
    [
        ({"user_id": "u", "version_id": VERSION_ID}, office_tokens.AUDIENCE_CALLBACK),
        ({"session_id": SESSION_ID}, office_tokens.AUDIENCE_DOWNLOAD),
    ],
)
def test_wrong_audience_is_rejected(issue_kwargs: dict, audience: str) -> None:
    token = office_tokens._issue(
        office_tokens.AUDIENCE_DOWNLOAD if audience == office_tokens.AUDIENCE_CALLBACK
        else office_tokens.AUDIENCE_CALLBACK,
        file_id=FILE_ID,
        ttl_seconds=600,
        **issue_kwargs,
    )
    with pytest.raises(AppError) as excinfo:
        office_tokens.verify_token(token, audience=audience, file_id=FILE_ID)
    assert excinfo.value.detail["code"] == "OFFICE_TOKEN_INVALID"


def test_wrong_file_signature_and_missing_claims_are_rejected(monkeypatch) -> None:
    token = office_tokens.issue_download_token(
        user_id="u", file_id=FILE_ID, version_id=VERSION_ID
    )
    with pytest.raises(AppError):
        office_tokens.verify_token(
            token, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id="other-file"
        )
    with pytest.raises(AppError):
        office_tokens.verify_token(None, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID)

    monkeypatch.setattr(settings, "office_token_secret", "b" * 32)
    with pytest.raises(AppError):
        office_tokens.verify_token(
            token, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID
        )


def test_expired_token_is_rejected_but_30s_leeway_applies() -> None:
    now = int(time.time())
    base = {
        "aud": office_tokens.AUDIENCE_DOWNLOAD,
        "typ": "office_url",
        "fid": FILE_ID,
        "vid": VERSION_ID,
        "jti": "jti",
    }
    expired = jwt.encode({**base, "iat": now - 120, "exp": now - 100}, SECRET, algorithm="HS256")
    with pytest.raises(AppError):
        office_tokens.verify_token(
            expired, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID
        )

    recent = jwt.encode({**base, "iat": now - 40, "exp": now - 10}, SECRET, algorithm="HS256")
    assert office_tokens.verify_token(
        recent, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID
    )["fid"] == FILE_ID


def test_wrong_type_and_missing_version_are_rejected() -> None:
    now = int(time.time())
    base = {
        "aud": office_tokens.AUDIENCE_DOWNLOAD,
        "fid": FILE_ID,
        "iat": now,
        "exp": now + 600,
        "jti": "x",
    }
    wrong_type = jwt.encode({**base, "typ": "access", "vid": VERSION_ID}, SECRET, algorithm="HS256")
    no_vid = jwt.encode({**base, "typ": "office_url"}, SECRET, algorithm="HS256")
    for token in (wrong_type, no_vid):
        with pytest.raises(AppError):
            office_tokens.verify_token(
                token, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=FILE_ID
            )
