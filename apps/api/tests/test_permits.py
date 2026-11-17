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


def test_permit_end_must_be_after_start(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(PERMIT, start_time="11:00:00", end_time="10:00:00", duration_hours=1)
    response = client.post("/api/permits", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "PERMIT_TIME_INVALID"


def test_permit_duration_must_match_the_time_window(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(PERMIT, start_time="10:00:00", end_time="11:00:00", duration_hours=0.5)
    response = client.post("/api/permits", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "PERMIT_TIME_MISMATCH"


def test_permit_overlap_same_day_rejected(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    first = client.post("/api/permits", json=PERMIT, headers=headers)
    assert first.status_code == 201, first.text

    overlapping = dict(PERMIT, start_time="10:30:00", end_time="11:30:00", duration_hours=1)
    response = client.post("/api/permits", json=overlapping, headers=headers)
    assert response.status_code == 409
    assert response.json()["code"] == "PERMIT_OVERLAP"


def test_permit_daily_limit_is_enforced(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)

    first = dict(
        PERMIT, permit_type="إذن عمل", start_time="08:00:00", end_time="11:00:00", duration_hours=3
    )
    second = dict(
        PERMIT, permit_type="إذن عمل", start_time="11:00:00", end_time="12:00:00", duration_hours=1
    )
    third = dict(
        PERMIT, permit_type="إذن عمل", start_time="12:00:00", end_time="13:00:00", duration_hours=1
    )
    assert client.post("/api/permits", json=first, headers=headers).status_code == 201
    assert client.post("/api/permits", json=second, headers=headers).status_code == 201
    response = client.post("/api/permits", json=third, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "PERMIT_DAILY_LIMIT_EXCEEDED"


def test_work_permit_over_four_hours_rejected(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(
        PERMIT, permit_type="إذن عمل", start_time="08:00:00", end_time="13:00:00", duration_hours=5
    )
    response = client.post("/api/permits", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "PERMIT_WORK_DURATION_EXCEEDED"


def test_mission_days_must_match_the_date_range(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(MISSION, days_count=5)
    response = client.post("/api/missions", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "MISSION_DAYS_MISMATCH"


def test_mission_without_allowance_has_zero_total(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(MISSION, mission_type="مأمورية بدون بدل", allowance_per_day=450)
    response = client.post("/api/missions", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    assert response.json()["total_allowance"] == 0
    assert response.json()["allowance_per_day"] == 0


def test_mission_daily_allowance_is_capped(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    payload = dict(MISSION, allowance_per_day=5000)
    response = client.post("/api/missions", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "MISSION_ALLOWANCE_EXCEEDED"


def test_viewer_cannot_create_permits_or_missions(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    viewer = login(client, "viewer")
    assert client.post("/api/permits", json=PERMIT, headers=viewer).status_code == 403
    assert client.post("/api/missions", json=MISSION, headers=viewer).status_code == 403
