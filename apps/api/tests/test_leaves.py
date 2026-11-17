from fastapi.testclient import TestClient

from tests.conftest import login

EMPLOYEE = {
    "employee_id": "9003",
    "name": "م. مروان أشرف الشريف",
    "department": "السلامة والصحة المهنية",
    "current_title": "مهندس سلامة",
    "hire_date": "2021-06-01",
}

LEAVE = {
    "employee_id": "9003",
    "leave_type": "اعتيادي",
    "start_date": "2026-11-15",
    "end_date": "2026-11-19",
    "days_count": 5,
    "reason": "إجازة سنوية",
}


def _create_employee(client: TestClient, headers: dict[str, str]) -> None:
    client.post("/api/employees", json=EMPLOYEE, headers=headers)


def test_leave_created_pending(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    response = client.post("/api/leaves", json=LEAVE, headers=headers)
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "قيد المراجعة"


def test_leave_overlap_rejected(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    client.post("/api/leaves", json=LEAVE, headers=headers)
    response = client.post("/api/leaves", json=LEAVE, headers=headers)
    assert response.status_code == 409
    assert response.json()["code"] == "LEAVE_OVERLAP"


def test_leave_balance_cannot_be_exceeded(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    payload = dict(LEAVE, days_count=40, end_date="2026-12-31")
    response = client.post("/api/leaves", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "LEAVE_BALANCE_EXCEEDED"


def test_approval_deducts_balance_only_once(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]

    approved = client.post(f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=headers)
    assert approved.status_code == 200
    assert approved.json()["approved_by"] == "Admin"

    again = client.post(f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=headers)
    assert again.status_code == 409
    assert again.json()["code"] == "LEAVE_ALREADY_DECIDED"


def test_rejected_leave_does_not_deduct(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]
    rejected = client.post(f"/api/leaves/{leave_id}/decision", json={"status": "مرفوض"}, headers=headers)
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "مرفوض"


def test_balances_are_created_and_deducted_after_approval(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]
    client.post(f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=headers)

    response = client.get("/api/leave-balances", params={"employee_id": "9003"}, headers=headers)
    assert response.status_code == 200, response.text
    balances = response.json()
    assert len(balances) == 1
    assert balances[0]["annual_used"] == 5
    assert balances[0]["annual_total"] == 21


def test_balances_require_authentication(client: TestClient) -> None:
    assert client.get("/api/leave-balances").status_code == 401


def test_decision_requires_an_approver_role(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]

    viewer = login(client, "viewer")
    forbidden = client.post(
        f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=viewer
    )
    assert forbidden.status_code == 403
    assert forbidden.json()["code"] == "FORBIDDEN"

    supervisor = login(client, "supervisor")
    also_forbidden = client.post(
        f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=supervisor
    )
    assert also_forbidden.status_code == 403


def test_hr_can_approve_and_the_note_is_stored(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]

    hr = login(client, "hr")
    response = client.post(
        f"/api/leaves/{leave_id}/decision",
        json={"status": "معتمد", "notes": "موافق بعد مراجعة البديل"},
        headers=hr,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["approved_by"] == "Hr"
    assert body["decision_notes"] == "موافق بعد مراجعة البديل"
    assert body["status"] == "معتمد"


def test_rejected_leave_cannot_be_approved_later(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    leave_id = client.post("/api/leaves", json=LEAVE, headers=headers).json()["id"]

    rejected = client.post(
        f"/api/leaves/{leave_id}/decision",
        json={"status": "مرفوض", "notes": "لا يوجد رصيد كافٍ"},
        headers=headers,
    )
    assert rejected.status_code == 200
    assert rejected.json()["decision_notes"] == "لا يوجد رصيد كافٍ"

    approve_after = client.post(
        f"/api/leaves/{leave_id}/decision", json={"status": "معتمد"}, headers=headers
    )
    assert approve_after.status_code == 409
    assert approve_after.json()["code"] == "LEAVE_ALREADY_DECIDED"

    balances = client.get("/api/leave-balances", params={"employee_id": "9003"}, headers=headers)
    assert balances.json()[0]["annual_used"] == 0


def test_leave_days_cannot_exceed_the_date_range(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    payload = dict(LEAVE, days_count=10, end_date="2026-11-16")
    response = client.post("/api/leaves", json=payload, headers=headers)
    assert response.status_code == 422
    assert response.json()["code"] == "LEAVE_DAYS_EXCEEDED"


def test_viewer_cannot_create_a_leave(client: TestClient) -> None:
    headers = login(client)
    _create_employee(client, headers)
    viewer = login(client, "viewer")
    response = client.post("/api/leaves", json=LEAVE, headers=viewer)
    assert response.status_code == 403
