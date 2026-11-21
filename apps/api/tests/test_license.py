from fastapi.testclient import TestClient

from app.core.config import settings
from tests.conftest import login


def test_license_status_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/license/status").status_code == 401


def test_license_status_is_reported_without_blocking(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "license_key", "")
    monkeypatch.setattr(settings, "license_expires_on", "")
    headers = login(client)
    response = client.get("/api/license/status", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "unconfigured"
    assert body["source"] in {"none", "env"}
    assert body["client_name"] is None
    assert body["issued_on"] is None
    assert body["hardware_matches"] is None
    assert body["enforced"] is False
    assert body["license_key_present"] is False


def test_active_license_reports_days_remaining(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(settings, "license_key", "SMD-TEST-KEY-1234")
    monkeypatch.setattr(settings, "license_expires_on", "2099-12-31")
    headers = login(client)
    body = client.get("/api/license/status", headers=headers).json()
    assert body["status"] == "active"
    assert body["source"] == "env"
    assert body["license_key_present"] is True
    assert body["expires_on"] == "2099-12-31"
    assert body["days_remaining"] > 0


def test_expired_license_is_status_only_and_does_not_block_requests(
    client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "license_key", "SMD-EXPIRED-KEY")
    monkeypatch.setattr(settings, "license_expires_on", "2000-01-01")
    headers = login(client)
    body = client.get("/api/license/status", headers=headers).json()
    assert body["status"] == "expired"
    # The health endpoint still works: licence enforcement is a placeholder.
    assert client.get("/api/health").status_code == 200
