"""ZKTeco connector tests: config, connection test, sync, dedupe and logs.

A fake terminal is injected through the `get_connector_factory` dependency, so
these tests never touch the network and do not require `pyzk` on the host.
"""

from datetime import datetime

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.device import ZktecoDevice
from app.services import zkteco
from tests.conftest import login

DEVICE = {
    "name": "جهاز البوابة الرئيسية",
    "ip_address": "192.168.1.201",
    "port": 4370,
    "comm_key": "741852",
    "location": "البوابة الرئيسية",
    "model": "ZKTeco K40",
}

EMPLOYEE = {
    "employee_id": "9001",
    "name": "م. أحمد محمود سعيد",
    "department": "الإدارة العامة",
    "current_title": "مدير عام",
    "hire_date": "2020-01-01",
    "hourly_rate": 90,
}

PUNCHES = [
    zkteco.PunchRecord(
        enroll_number="9001",
        punch_time=datetime(2026, 11, 12, 7, 55, 0),
        punch_type="دخول",
        verify_mode="بصمة إصبع",
    ),
    zkteco.PunchRecord(
        enroll_number="9001",
        punch_time=datetime(2026, 11, 12, 20, 0, 0),
        punch_type="خروج",
        verify_mode="بصمة إصبع",
    ),
]

INFO = zkteco.DeviceInfo(
    serial_number="SN-123456",
    firmware_version="6.60.1",
    device_name="K40",
    user_count=42,
    log_count=1200,
)


class FakeConnector:
    def __init__(
        self,
        punches: list[zkteco.PunchRecord] | None = None,
        info: zkteco.DeviceInfo = INFO,
        fail_first: int = 0,
        error: zkteco.ConnectorError | None = None,
    ) -> None:
        self.punches = punches or []
        self.info = info
        self.fail_first = fail_first
        self.error = error
        self.calls = 0

    def _maybe_fail(self) -> None:
        self.calls += 1
        if self.error is not None and self.calls > self.fail_first:
            raise self.error
        if self.calls <= self.fail_first:
            raise zkteco.ConnectorError("فشل مؤقت في الاتصال.")

    def test_connection(self) -> zkteco.DeviceInfo:
        self._maybe_fail()
        return self.info

    def fetch_punches(self, since: datetime | None = None) -> list[zkteco.PunchRecord]:
        self._maybe_fail()
        return self.punches


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "zkteco_retry_delay_seconds", 0.0)


def _use_terminal(connector: FakeConnector) -> None:
    app.dependency_overrides[zkteco.get_connector_factory] = lambda: (lambda device: connector)


def _create_device(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post("/api/devices", json=DEVICE, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _create_employee(client: TestClient, headers: dict[str, str]) -> None:
    response = client.post("/api/employees", json=EMPLOYEE, headers=headers)
    assert response.status_code == 201, response.text


def test_comm_key_is_write_only(client: TestClient, db) -> None:
    headers = login(client)
    body = _create_device(client, headers)

    assert "comm_key" not in body
    assert body["has_comm_key"] is True
    stored = db.get(ZktecoDevice, body["id"])
    assert stored is not None and stored.comm_key == "741852"

    listed = client.get("/api/devices", headers=headers).json()
    assert listed and "comm_key" not in listed[0]
    assert listed[0]["has_comm_key"] is True

    updated = client.patch(
        f"/api/devices/{body['id']}", json={**DEVICE, "comm_key": "", "name": "بوابة 2"},
        headers=headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "بوابة 2"
    db.expire_all()
    assert db.get(ZktecoDevice, body["id"]).comm_key == "741852"


def test_viewer_cannot_operate_devices(client: TestClient) -> None:
    admin = login(client)
    body = _create_device(client, admin)
    viewer = login(client, "viewer")

    for path in (f"/api/devices/{body['id']}/test-connection", f"/api/devices/{body['id']}/sync"):
        response = client.post(path, headers=viewer)
        assert response.status_code == 403, path
        assert response.json()["code"] == "FORBIDDEN"


def test_connection_test_updates_device_and_retries(client: TestClient) -> None:
    headers = login(client)
    body = _create_device(client, headers)
    terminal = FakeConnector(fail_first=1)
    _use_terminal(terminal)

    response = client.post(f"/api/devices/{body['id']}/test-connection", headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["serial_number"] == "SN-123456"
    assert payload["user_count"] == 42
    assert "741852" not in response.text
    assert terminal.calls == 2  # one failure + one successful retry

    listed = client.get("/api/devices", headers=headers).json()
    assert listed[0]["status"] == "connected"
    assert listed[0]["serial_number"] == "SN-123456"
    assert listed[0]["firmware_version"] == "6.60.1"


def test_connection_test_reports_missing_connector(client: TestClient) -> None:
    headers = login(client)
    body = _create_device(client, headers)
    _use_terminal(FakeConnector(error=zkteco.ConnectorUnavailable("pyzk غير مثبتة.")))

    response = client.post(f"/api/devices/{body['id']}/test-connection", headers=headers)
    assert response.status_code == 503
    assert response.json()["code"] == "CONNECTOR_UNAVAILABLE"
    assert client.get("/api/devices", headers=headers).json()[0]["status"] == "error"


def test_sync_inserts_each_punch_once(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    body = _create_device(client, headers)
    _use_terminal(FakeConnector(punches=PUNCHES))

    first = client.post(f"/api/devices/{body['id']}/sync", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["fetched_count"] == 2
    assert first.json()["inserted_count"] == 2
    assert first.json()["duplicate_count"] == 0
    assert first.json()["unknown_count"] == 0

    second = client.post(f"/api/devices/{body['id']}/sync", headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["fetched_count"] == 2
    assert second.json()["inserted_count"] == 0
    assert second.json()["duplicate_count"] == 2

    punches = client.get("/api/devices/punches", headers=headers).json()
    assert len(punches) == 2
    assert {punch["punch_type"] for punch in punches} == {"دخول", "خروج"}
    assert punches[0]["punch_time"].startswith("2026-11-12T")

    logs = client.get("/api/devices/sync-logs", params={"device_id": body["id"]}, headers=headers).json()
    assert len(logs) == 2
    assert logs[0]["status"] == "success"
    assert logs[1]["inserted_count"] == 2


def test_sync_counts_unknown_pins_but_keeps_them(client: TestClient) -> None:
    headers = login(client)
    body = _create_device(client, headers)
    unknown = zkteco.PunchRecord(
        enroll_number="9999",
        punch_time=datetime(2026, 11, 12, 8, 5, 0),
        punch_type="دخول",
        verify_mode="بصمة وجه",
    )
    _use_terminal(FakeConnector(punches=[unknown]))

    response = client.post(f"/api/devices/{body['id']}/sync", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["inserted_count"] == 1
    assert response.json()["unknown_count"] == 1
    assert len(client.get("/api/devices/punches", headers=headers).json()) == 1


def test_failed_sync_is_logged_and_device_marked_error(client: TestClient) -> None:
    headers = login(client)
    body = _create_device(client, headers)
    _use_terminal(FakeConnector(error=zkteco.ConnectorTimeout("انتهت المهلة.")))

    response = client.post(f"/api/devices/{body['id']}/sync", headers=headers)
    assert response.status_code == 504
    assert response.json()["code"] == "CONNECTOR_TIMEOUT"

    logs = client.get("/api/devices/sync-logs", params={"device_id": body["id"]}, headers=headers).json()
    assert len(logs) == 1
    assert logs[0]["status"] == "failed"
    assert logs[0]["error_message"] == "انتهت المهلة."
    assert client.get("/api/devices", headers=headers).json()[0]["status"] == "error"


def test_delete_device_removes_punches_and_logs(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    body = _create_device(client, headers)
    _use_terminal(FakeConnector(punches=PUNCHES))
    client.post(f"/api/devices/{body['id']}/sync", headers=headers)

    deleted = client.delete(f"/api/devices/{body['id']}", headers=headers)
    assert deleted.status_code == 204, deleted.text
    assert client.get("/api/devices/punches", headers=headers).json() == []
    assert client.get("/api/devices/sync-logs", headers=headers).json() == []


def test_unauthenticated_calls_are_rejected(client: TestClient) -> None:
    assert client.get("/api/devices/punches").status_code == 401
    assert client.post("/api/devices/anything/sync").status_code == 401
