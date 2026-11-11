from fastapi.testclient import TestClient

from tests.conftest import login


def test_login_returns_token_and_user(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "admin", "password": "Admin@12345"})
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["username"] == "admin"
    assert body["user"]["role"] == "ADMIN"


def test_login_rejects_wrong_password(client: TestClient) -> None:
    response = client.post("/api/auth/login", json={"username": "admin", "password": "nope"})
    assert response.status_code == 401
    assert response.json()["code"] == "INVALID_CREDENTIALS"


def test_me_requires_token(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401


def test_me_returns_current_user(client: TestClient) -> None:
    response = client.get("/api/auth/me", headers=login(client, "hr"))
    assert response.status_code == 200
    assert response.json()["role"] == "HR"


def test_oauth2_form_token(client: TestClient) -> None:
    response = client.post("/api/auth/token", data={"username": "viewer", "password": "Viewer@12345"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "VIEWER"
