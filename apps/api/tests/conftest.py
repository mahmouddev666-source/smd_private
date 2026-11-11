"""Shared pytest fixtures: in-memory SQLite + FastAPI test client."""

import os
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite://")
os.environ.setdefault("APP_ENV", "test")

from app.core.security import hash_password  # noqa: E402
from app.db.base import Base  # noqa: E402
from app.db.session import get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402
from app.utils.ids import new_id  # noqa: E402

engine = create_engine(
    "sqlite+pysqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

DEMO_ACCOUNTS = {
    "admin": ("Admin@12345", "ADMIN"),
    "hr": ("Hr@12345", "HR"),
    "viewer": ("Viewer@12345", "VIEWER"),
}


@pytest.fixture()
def db() -> Generator[Session, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        for username, (password, role) in DEMO_ACCOUNTS.items():
            session.add(
                User(
                    id=new_id(),
                    username=username,
                    full_name=username.title(),
                    password_hash=hash_password(password),
                    role=role,
                    is_active=True,
                    is_demo=True,
                )
            )
        session.commit()
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db: Session) -> Generator[TestClient, None, None]:
    def override_get_db() -> Generator[Session, None, None]:
        yield db

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def login(client: TestClient, username: str = "admin") -> dict[str, str]:
    password = DEMO_ACCOUNTS[username][0]
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
