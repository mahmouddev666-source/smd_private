"""T3-08: T3 Document Server JWTs — both callback shapes, no exp reliance."""

import time

import jwt
import pytest

from app.core.config import settings
from app.core.errors import AppError
from app.services import office_jwt

SECRET = "ds-secret-key-" + "x" * 20


@pytest.fixture(autouse=True)
def ds_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "onlyoffice_jwt_secret", SECRET)
    monkeypatch.setattr(settings, "office_require_ds_download_token", True)
    monkeypatch.setattr(office_jwt, "_health_cache", None, raising=False)


def _encode(payload: dict, secret: str = SECRET) -> str:
    return jwt.encode(payload, secret, algorithm="HS256")


def test_sign_config_signs_without_the_token_field() -> None:
    config = {"document": {"key": "smd-f-v"}, "editorConfig": {"mode": "edit"}}
    token = office_jwt.sign_config({**config, "token": "old"})
    claims = jwt.decode(token, SECRET, algorithms=["HS256"])
    assert claims == config
    assert "token" not in claims


def test_verify_callback_accepts_flat_and_wrapped_payloads() -> None:
    flat = _encode({"key": "smd-f-v", "status": 2, "operation": "callback"})
    wrapped = _encode({"payload": {"key": "smd-f-v", "status": 6}, "operation": "callback"})
    assert office_jwt.verify_callback(flat)["status"] == 2
    assert office_jwt.verify_callback(wrapped)["status"] == 6


def test_verify_callback_rejects_bad_signature_operation_and_status() -> None:
    bad_signature = _encode({"key": "k", "status": 2}, secret="wrong-secret")
    wrong_operation = _encode({"key": "k", "status": 2, "operation": "download"})
    bad_status = _encode({"key": "k", "status": 99})
    for token in (bad_signature, wrong_operation, bad_status, None):
        with pytest.raises(AppError):
            office_jwt.verify_callback(token)


def test_verify_callback_ignores_expiry() -> None:
    now = int(time.time())
    token = _encode({"key": "k", "status": 2, "exp": now - 3600})
    assert office_jwt.verify_callback(token)["status"] == 2


def test_verify_download_checks_operation_and_url_when_enabled() -> None:
    url = "http://api:8000/api/office/download/f-1?token=abc"
    valid = _encode({"operation": "download", "payload": {"url": url}})
    assert office_jwt.verify_download(valid, "/api/office/download/f-1?token=abc")[
        "operation"
    ] == "download"

    mismatched = _encode({"operation": "download", "payload": {"url": url}})
    with pytest.raises(AppError):
        office_jwt.verify_download(mismatched, "/api/office/download/f-1?token=other")
    with pytest.raises(AppError):
        office_jwt.verify_download(
            _encode({"operation": "callback", "payload": {"url": url}}),
            "/api/office/download/f-1?token=abc",
        )


def test_verify_download_url_binding_can_be_disabled(monkeypatch) -> None:
    monkeypatch.setattr(settings, "office_require_ds_download_token", False)
    token = _encode({"operation": "download", "payload": {"url": "http://api:8000/other"}})
    assert office_jwt.verify_download(token, "/api/office/download/f-1?token=abc")


def test_missing_secret_is_a_safe_503() -> None:
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(settings, "onlyoffice_jwt_secret", "")
    try:
        with pytest.raises(AppError) as excinfo:
            office_jwt.sign_config({"document": {}})
        assert excinfo.value.status_code == 503
    finally:
        monkeypatch.undo()
