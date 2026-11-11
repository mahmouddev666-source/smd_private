from fastapi.testclient import TestClient

from tests.conftest import login

EMPLOYEE = {
    "employee_id": "9004",
    "name": "م. طارق الشناوي",
    "department": "الصيانة",
    "current_title": "رئيس قسم الصيانة",
    "hire_date": "2018-02-01",
}

PERMIT = {
    "employee_id": "9004",
    "permit_type": "إذن شخصي",
    "date": "2026-11-12",
    "start_time": "10:00:00",
    "end_time": "11:00:00",
    "duration_hours": 1,
    "reason": "إنهاء معاملة",
}

MISSION = {
    "employee_id": "9004",
    "mission_type": "مأمورية ببدل",
    "destination": "القاهرة",
    "purpose": "اجتماع",
    "start_date": "2026-11-13",
    "end_date": "2026-11-14",
    "days_count": 2,
    "allowance_per_day": 450,
    "transportation_type": "سيارة الشركة",
}


def test_personal_permit_over_two_hours_rejected(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(PERMIT, duration_hours=3)
    response = client.post("/api/permits", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "PERMIT_DURATION_EXCEEDED"


def test_permit_created_and_listed(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    created = client.post("/api/permits", json=PERMIT, headers=headers)
    assert created.status_code == 201, created.text
    listing = client.get("/api/permits", params={"employee_id": "9004"}, headers=headers)
    assert len(listing.json()) == 1


def test_mission_total_allowance_is_computed_on_server(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    response = client.post("/api/missions", json=MISSION, headers=headers)
    assert response.status_code == 201, response.text
    assert response.json()["total_allowance"] == 900
