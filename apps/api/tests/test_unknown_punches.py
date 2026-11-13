"""Unknown biometrics report: listing, assigning to an employee and ignoring."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.device import BiometricPunch
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
    "default_shift": "NORMAL_DAY",
}


class FakeConnector:
    def __init__(self, punches: list[zkteco.PunchRecord]) -> None:
        self.punches = punches

    def test_connection(self) -> zkteco.DeviceInfo:
        return zkteco.DeviceInfo("SN", "6.60.1", "K40", 1, len(self.punches))

    def fetch_punches(self, since: datetime | None = None) -> list[zkteco.PunchRecord]:
        return self.punches


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "zkteco_retry_delay_seconds", 0.0)


def _setup(client: TestClient, punches: list[zkteco.PunchRecord]) -> tuple[dict, dict, dict]:
    headers = login(client)
    employee = client.post("/api/employees", json=EMPLOYEE, headers=headers)
    assert employee.status_code == 201, employee.text
    device = client.post("/api/devices", json=DEVICE, headers=headers)
    assert device.status_code == 201, device.text
    app.dependency_overrides[zkteco.get_connector_factory] = lambda: (
        lambda _device: FakeConnector(punches)
    )
    return headers, employee.json(), device.json()


def _now(hour: int, minute: int, days_ago: int = 1) -> datetime:
    moment = datetime.now().replace(hour=hour, minute=minute, second=0, microsecond=0)
    return moment - timedelta(days=days_ago)


def test_unknown_report_lists_unmatched_pin(client: TestClient) -> None:
    headers, _, device = _setup(
        client,
        [
            zkteco.PunchRecord("9001", _now(7, 55), "دخول", "بصمة إصبع"),
            zkteco.PunchRecord("7777", _now(9, 12), "دخول", "بصمة إصبع"),
        ],
    )

    synced = client.post(f"/api/devices/{device['id']}/sync", headers=headers)
    assert synced.status_code == 200, synced.text
    assert synced.json()["attendance_created"] == 1
    assert synced.json()["unknown_count"] == 1

    report = client.get("/api/devices/unknown-punches", headers=headers)
    assert report.status_code == 200, report.text
    rows = report.json()
    assert len(rows) == 1
    assert rows[0]["enroll_number"] == "7777"
    assert rows[0]["device_name"] == DEVICE["name"]
    assert rows[0]["is_ignored"] is False


def test_assigning_unknown_punch_maps_it_to_attendance(client: TestClient) -> None:
    headers, _, device = _setup(
        client,
        [zkteco.PunchRecord("7777", _now(8, 0), "دخول", "بصمة إصبع")],
    )
    client.post(f"/api/devices/{device['id']}/sync", headers=headers)
    punch = client.get("/api/devices/unknown-punches", headers=headers).json()[0]

    response = client.post(
        f"/api/devices/punches/{punch['id']}/assign",
        json={"employee_id": "9001"},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["punch"]["resolved_employee_id"] == "9001"
    assert payload["attendance_created"] is True
    assert "9001" in payload["message"]

    assert client.get("/api/devices/unknown-punches", headers=headers).json() == []
    attendance = client.get("/api/attendance", params={"employee_id": "9001"}, headers=headers)
    assert attendance.status_code == 200
    assert attendance.json()["total"] == 1
    assert attendance.json()["items"][0]["check_in"].startswith("08:00")


def test_ignoring_unknown_punch_removes_it_from_report(client: TestClient) -> None:
    headers, _, device = _setup(
        client,
        [zkteco.PunchRecord("8888", _now(10, 15), "دخول", "بصمة وجه")],
    )
    client.post(f"/api/devices/{device['id']}/sync", headers=headers)
    punch = client.get("/api/devices/unknown-punches", headers=headers).json()[0]

    response = client.post(
        f"/api/devices/punches/{punch['id']}/ignore", headers=headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["punch"]["is_ignored"] is True
    assert client.get("/api/devices/unknown-punches", headers=headers).json() == []


def test_assign_requires_editor_role(client: TestClient) -> None:
    headers, _, device = _setup(
        client, [zkteco.PunchRecord("7777", _now(9, 0), "دخول", "بصمة إصبع")]
    )
    client.post(f"/api/devices/{device['id']}/sync", headers=headers)
    punch = client.get("/api/devices/unknown-punches", headers=headers).json()[0]

    viewer = login(client, "viewer")
    assigned = client.post(
        f"/api/devices/punches/{punch['id']}/assign",
        json={"employee_id": "9001"},
        headers=viewer,
    )
    ignored = client.post(
        f"/api/devices/punches/{punch['id']}/ignore", headers=viewer
    )
    assert assigned.status_code == 403
    assert ignored.status_code == 403


def test_assign_unknown_employee_is_rejected(client: TestClient, db) -> None:
    headers, _, device = _setup(
        client, [zkteco.PunchRecord("7777", _now(9, 0), "دخول", "بصمة إصبع")]
    )
    client.post(f"/api/devices/{device['id']}/sync", headers=headers)
    punch = client.get("/api/devices/unknown-punches", headers=headers).json()[0]

    response = client.post(
        f"/api/devices/punches/{punch['id']}/assign",
        json={"employee_id": "0000"},
        headers=headers,
    )
    assert response.status_code == 404
    assert response.json()["code"] == "EMPLOYEE_NOT_FOUND"

    stored = db.get(BiometricPunch, punch["id"])
    assert stored is not None and stored.resolved_employee_id is None
