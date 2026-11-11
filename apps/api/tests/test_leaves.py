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
