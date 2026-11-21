"""T3-09: /api/office/status — 2s healthcheck, 30s cache, no URL leakage."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.services import office as office_service
from tests.conftest import login
from tests.office_helpers import office_on  # noqa: F401 - fixture


def test_disabled_status_never_calls_the_network(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = login(client)

    def unexpected(*args, **kwargs):
        raise AssertionError("healthcheck must not run while disabled")

    monkeypatch.setattr(office_service.httpx, "get", unexpected)
    response = client.get("/api/office/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["enabled"] is False
    assert body["available"] is False
    assert body["documentserverVersion"] is None
    assert "onlyoffice" not in response.text
    assert response.headers["cache-control"] == "no-store"


def test_enabled_status_reports_version_and_caches(
    client: TestClient, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[str] = []

    def fake_get(url: str, timeout: float):
        calls.append(url)
        assert timeout == 2.0
        return SimpleNamespace(
            status_code=200,
            json=lambda: {"version": "10.0.0.1"},
            headers={},
        )

    monkeypatch.setattr(office_service.httpx, "get", fake_get)
    headers = login(client)
    first = client.get("/api/office/status", headers=headers)
    second = client.get("/api/office/status", headers=headers)

    assert first.status_code == 200
    assert first.json()["enabled"] is True
    assert first.json()["available"] is True
    assert first.json()["documentserverVersion"] == "10.0.0.1"
    assert second.json() == first.json()
    assert len(calls) == 1
    assert all("onlyoffice/healthcheck" in url for url in calls)
    assert "onlyoffice" not in response_text_without_version(first.text)
    assert first.headers["cache-control"] == "no-store"


def response_text_without_version(text: str) -> str:
    return text.replace("10.0.0.1", "")


def test_healthcheck_failure_is_not_a_500(
    client: TestClient, office_on, monkeypatch: pytest.MonkeyPatch
) -> None:
    def failing(*args, **kwargs):
        raise OSError("DS offline")

    monkeypatch.setattr(office_service.httpx, "get", failing)
    response = client.get("/api/office/status", headers=login(client))
    assert response.status_code == 200
    assert response.json()["enabled"] is True
    assert response.json()["available"] is False
    assert response.json()["documentserverVersion"] is None


def test_status_requires_authentication(client: TestClient) -> None:
    assert client.get("/api/office/status").status_code == 401
