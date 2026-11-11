from fastapi.testclient import TestClient

from tests.conftest import login

EMPLOYEE = {
    "employee_id": "9001",
    "name": "م. أحمد محمود سعيد",
    "national_id": "29304151409811",
    "department": "الإدارة العامة",
    "current_title": "مدير عام",
    "hire_date": "2020-01-01",
    "hourly_rate": 90,
}


def test_admin_creates_employee(client: TestClient) -> None:
    response = client.post("/api/employees", json=EMPLOYEE, headers=login(client))
    assert response.status_code == 201, response.text
    assert response.json()["employee_id"] == "9001"
    assert response.json()["is_demo"] is True


def test_duplicate_employee_code_is_rejected(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    response = client.post("/api/employees", json=EMPLOYEE, headers=headers)
    assert response.status_code == 409
    assert response.json()["code"] == "EMPLOYEE_CODE_EXISTS"


def test_viewer_cannot_create_employee(client: TestClient) -> None:
    response = client.post("/api/employees", json=EMPLOYEE, headers=login(client, "viewer"))
    assert response.status_code == 403
    assert response.json()["code"] == "FORBIDDEN"


def test_list_and_search_employees(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    response = client.get("/api/employees", params={"search": "أحمد"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["total"] == 1


def test_update_employee(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    response = client.patch("/api/employees/9001", json={"current_title": "مدير عام العمليات"}, headers=headers)
    assert response.status_code == 200
    assert response.json()["current_title"] == "مدير عام العمليات"


def test_delete_is_soft(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    response = client.delete("/api/employees/9001", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is False
