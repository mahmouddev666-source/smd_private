"""T3-07: short-lived T2 URL tokens issued by the API for Document Server.

T2 is deliberately separate from the user access token (T1) and from the
Document Server JWT (T3). It is safe to expose in the editor config because it
only authorises two narrow, expiring URLs.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import jwt

from app.core.config import settings
from app.core.errors import AppError

AUDIENCE_DOWNLOAD = "office:download"
AUDIENCE_CALLBACK = "office:callback"
TOKEN_TYPE = "office_url"
ALGORITHM = "HS256"


def _issue(
    audience: str,
    *,
    file_id: str,
    ttl_seconds: int,
    user_id: str | None = None,
    version_id: str | None = None,
    session_id: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, object] = {
        "aud": audience,
        "typ": TOKEN_TYPE,
        "fid": file_id,
        "jti": str(uuid.uuid4()),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    if user_id:
        payload["sub"] = user_id
    if version_id:
        payload["vid"] = version_id
    if session_id:
        payload["sid"] = session_id
    return jwt.encode(payload, settings.office_token_key, algorithm=ALGORITHM)


def issue_download_token(
    *,
    user_id: str,
    file_id: str,
    version_id: str,
    ttl_seconds: int | None = None,
) -> str:
    return _issue(
        AUDIENCE_DOWNLOAD,
        file_id=file_id,
        ttl_seconds=ttl_seconds or settings.office_download_token_ttl_seconds,
        user_id=user_id,
        version_id=version_id,
    )


def issue_callback_token(
    *,
    file_id: str,
    session_id: str,
    user_id: str | None = None,
    ttl_seconds: int | None = None,
) -> str:
    return _issue(
        AUDIENCE_CALLBACK,
        file_id=file_id,
        ttl_seconds=ttl_seconds or settings.office_callback_token_ttl_seconds,
        user_id=user_id,
        session_id=session_id,
    )


def verify_token(token: str | None, *, audience: str, file_id: str) -> dict:
    """Decode and validate a T2 token for the given path/audience."""
    if not token:
        raise AppError(401, "رابط المستند غير صالح أو منتهي.", "OFFICE_TOKEN_INVALID")
    try:
        claims = jwt.decode(
            token,
            settings.office_token_key,
            algorithms=[ALGORITHM],
            audience=audience,
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        raise AppError(401, "رابط المستند غير صالح أو منتهي.", "OFFICE_TOKEN_INVALID") from exc

    if claims.get("typ") != TOKEN_TYPE or claims.get("fid") != file_id:
        raise AppError(401, "رابط المستند غير صالح أو منتهي.", "OFFICE_TOKEN_INVALID")
    if audience == AUDIENCE_DOWNLOAD and not claims.get("vid"):
        raise AppError(401, "رابط المستند غير صالح أو منتهي.", "OFFICE_TOKEN_INVALID")
    if audience == AUDIENCE_CALLBACK and not claims.get("sid"):
        raise AppError(401, "رابط المستند غير صالح أو منتهي.", "OFFICE_TOKEN_INVALID")
    return claims
