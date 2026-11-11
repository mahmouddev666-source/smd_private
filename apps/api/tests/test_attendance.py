from fastapi.testclient import TestClient

from tests.conftest import login

EMPLOYEE = {
    "employee_id": "9002",
    "name": "أ. حسام الدين نبيل",
    "department": "الموارد البشرية",
    "current_title": "مدير الموارد البشرية",
    "hire_date": "2019-03-01",
}

ATTENDANCE = {
    "employee_id": "9002",
    "date": "2026-11-10",
    "check_in": "08:05:00",
    "check_out": "20:00:00",
    "status": "حاضر",
    "overtime_minutes": 120,
    "late_minutes": 5,
}


def test_attendance_upsert_creates_then_updates(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)

    first = client.post("/api/attendance", json=ATTENDANCE, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True

    updated = dict(ATTENDANCE, check_out="21:00:00")
    second = client.post("/api/attendance", json=updated, headers=headers)
    assert second.status_code == 200
    assert second.json()["created"] is False

    listing = client.get("/api/attendance", params={"employee_id": "9002"}, headers=headers)
    assert listing.json()["total"] == 1
    assert listing.json()["items"][0]["check_out"].startswith("21:00")


def test_attendance_requires_known_employee(client: TestClient) -> None:
    response = client.post("/api/attendance", json=ATTENDANCE, headers=login(client))
    assert response.status_code == 404
    assert response.json()["code"] == "EMPLOYEE_NOT_FOUND"


def test_viewer_cannot_write_attendance(client: TestClient) -> None:
    response = client.post("/api/attendance", json=ATTENDANCE, headers=login(client, "viewer"))
    assert response.status_code == 403
