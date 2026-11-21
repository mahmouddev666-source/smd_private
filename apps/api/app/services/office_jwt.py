"""T3-08: T3 JWTs shared with ONLYOFFICE Document Server.

The same secret signs our config and verifies DS callbacks / download
requests. We never trust T2 in place of T3: a browser can read the config (and
therefore T2), but it cannot forge a DS signature.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import jwt

from app.core.config import settings
from app.core.errors import AppError

ALGORITHM = "HS256"
CALLBACK_STATUSES = {1, 2, 3, 4, 6, 7}


def _secret() -> str:
    secret = settings.onlyoffice_jwt_secret
    if not secret:
        raise AppError(
            503,
            "إعداد توقيع ONLYOFFICE غير مكتمل على الخادم.",
            "OFFICE_UNAVAILABLE",
        )
    return secret


def sign_config(config: dict) -> str:
    """Sign the complete editor config *without* the ``token`` field itself."""
    payload = {key: value for key, value in config.items() if key != "token"}
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def _decode(token: str | None, error_code: str) -> dict:
    if not token:
        raise AppError(401, "توقيع ONLYOFFICE غير موجود.", error_code)
    try:
        claims = jwt.decode(
            token,
            _secret(),
            algorithms=[ALGORITHM],
            options={
                "verify_aud": False,
                # DS does not promise an `exp`; replay defence is key+checksum.
                "verify_exp": False,
            },
        )
    except jwt.PyJWTError as exc:
        raise AppError(401, "توقيع ONLYOFFICE غير صالح.", error_code) from exc
    if not isinstance(claims, dict):
        raise AppError(401, "توقيع ONLYOFFICE غير صالح.", error_code)
    return claims


def verify_callback(token: str | None) -> dict:
    """Accept flat and wrapped DS v10 callbacks; reject other operations."""
    claims = _decode(token, "OFFICE_CALLBACK_JWT_INVALID")
    operation = claims.get("operation")
    if operation is not None and operation != "callback":
        raise AppError(400, "عملية ONLYOFFICE غير متوقعة.", "OFFICE_CALLBACK_PAYLOAD_INVALID")

    payload = claims.get("payload")
    if isinstance(payload, dict) and payload:
        data = dict(payload)
    else:
        data = {
            key: value
            for key, value in claims.items()
            if key not in {"operation", "payload"}
        }

    if data.get("status") not in CALLBACK_STATUSES:
        raise AppError(400, "حالة ONLYOFFICE غير مدعومة.", "OFFICE_CALLBACK_PAYLOAD_INVALID")
    return data


def _path_and_query(url: str) -> str:
    split = urlsplit(url)
    return f"{split.path or '/'}" + (f"?{split.query}" if split.query else "")


def verify_download(token: str | None, request_target: str) -> dict:
    """Verify the optional DS download JWT and its URL binding."""
    claims = _decode(token, "OFFICE_TOKEN_INVALID")
    if claims.get("operation") != "download":
        raise AppError(401, "توكن تنزيل ONLYOFFICE غير صالح.", "OFFICE_TOKEN_INVALID")

    payload = claims.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("url"), str):
        raise AppError(401, "توكن تنزيل ONLYOFFICE غير صالح.", "OFFICE_TOKEN_INVALID")

    if settings.office_require_ds_download_token:
        if _path_and_query(payload["url"]) != _path_and_query(request_target):
            raise AppError(401, "توكن تنزيل ONLYOFFICE غير صالح.", "OFFICE_TOKEN_INVALID")
    return claims
