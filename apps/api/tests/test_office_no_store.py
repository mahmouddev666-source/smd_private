"""Wave B invariant: every /api/office/* response is non-cacheable.

Success paths are asserted in their own test modules; this module covers the
error shapes that are produced outside the route handler (401/403/404/422).
"""

from fastapi.testclient import TestClient

from tests.conftest import login
from tests.office_helpers import make_file, office_on  # noqa: F401
from sqlalchemy.orm import Session


def _assert_no_store(response) -> None:
    assert response.headers["cache-control"] == "no-store", (
        f"{response.request.method} {response.request.url} -> {response.status_code}"
    )
    assert response.headers["x-content-type-options"] == "nosniff"


def test_no_store_on_401_403_404_and_422(
    client: TestClient, db: Session, office_on
) -> None:
    file, _ = make_file(db)

    # 401 — unauthenticated status endpoint.
    _assert_no_store(client.get("/api/office/status"))

    # 403 — role denied on editor config.
    _assert_no_store(client.get(f"/api/office/config/{file.id}", headers=login(client, "viewer")))

    # 404 — unknown office route.
    _assert_no_store(client.get("/api/office/not-a-real-path", headers=login(client)))

    # 422 — Pydantic validation error on the close-session body.
    _assert_no_store(
        client.post(
            f"/api/office/files/{file.id}/sessions/close",
            json={"reason": "bogus"},
            headers=login(client),
        )
    )


def test_no_store_on_missing_file_and_missing_version(
    client: TestClient, db: Session, office_on
) -> None:
    headers = login(client)
    _assert_no_store(client.get("/api/office/files/missing/versions", headers=headers))
    _assert_no_store(client.get("/api/office/config/missing", headers=headers))
