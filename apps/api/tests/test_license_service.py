"""T3-18: licence file verification, CLI and API behaviour."""

import json
import os
import subprocess
import sys
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.services import license as service
from tests.conftest import login

API_DIR = Path(__file__).resolve().parents[1]
HARDWARE = "a" * 64
KEY = "a-very-long-signing-key-for-tests-only"


@pytest.fixture()
def license_env(tmp_path: Path, monkeypatch):
    target = tmp_path / "license.json"
    monkeypatch.setattr(settings, "license_file", str(target))
    monkeypatch.setattr(settings, "license_signing_key", "")
    monkeypatch.setattr(settings, "license_hardware_id", HARDWARE)
    monkeypatch.setattr(settings, "license_key", "")
    monkeypatch.setattr(settings, "license_expires_on", "")
    monkeypatch.setattr(settings, "license_enforce", False)
    service.invalidate_cache()
    yield target
    service.invalidate_cache()


def _payload(**overrides: object) -> service.LicensePayload:
    values = dict(
        client_name="شركة السويس لمشتقات الميثانول",
        hardware_id=HARDWARE,
        issued_at=date.today() - timedelta(days=10),
        expires_at=date.today() + timedelta(days=300),
    )
    values.update(overrides)
    return service.LicensePayload(**values)  # type: ignore[arg-type]


def test_active_license_from_file(license_env: Path) -> None:
    service.build_file(_payload(), path=license_env)
    state = service.check_license()
    assert state.status == "active"
    assert state.source == "file"
    assert state.hardware_matches is True
    assert state.client_name == "شركة السويس لمشتقات الميثانول"
    assert state.days_remaining == 300


def test_expired_and_hardware_mismatch(license_env: Path) -> None:
    service.build_file(
        _payload(expires_at=date.today() - timedelta(days=1)), path=license_env
    )
    assert service.check_license().status == "expired"

    service.build_file(_payload(hardware_id="b" * 64), path=license_env)
    state = service.check_license()
    assert state.status == "hardware_mismatch"
    assert state.hardware_matches is False


def test_not_yet_valid(license_env: Path) -> None:
    service.build_file(
        _payload(
            issued_at=date.today() + timedelta(days=5),
            expires_at=date.today() + timedelta(days=100),
        ),
        path=license_env,
    )
    assert service.check_license().status == "not_yet_valid"


def test_malformed_or_unsigned_license_never_raises(license_env: Path, monkeypatch) -> None:
    license_env.write_text("{not json", encoding="utf-8")
    assert service.check_license().status == "invalid"

    service.build_file(_payload(), path=license_env)  # no signature
    monkeypatch.setattr(settings, "license_signing_key", KEY)
    assert service.check_license().status == "invalid"

    service.build_file(_payload(), signing_key=KEY, path=license_env)
    assert service.check_license().status == "active"

    raw = json.loads(license_env.read_text(encoding="utf-8"))
    raw["client_name"] = "تعديل غير مصرّح"
    license_env.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
    assert service.check_license().status == "invalid"


def test_missing_file_is_unconfigured(license_env: Path) -> None:
    assert not license_env.exists()
    state = service.check_license()
    assert state.status == "unconfigured"
    assert state.source == "none"


def test_startup_enforcement(license_env: Path, monkeypatch) -> None:
    service.build_file(
        _payload(expires_at=date.today() - timedelta(days=1)), path=license_env
    )
    assert service.enforce_startup().status == "expired"  # LICENSE_ENFORCE=false

    monkeypatch.setattr(settings, "license_enforce", True)
    with pytest.raises(RuntimeError, match="ترخيص SMD-HR غير صالح"):
        service.enforce_startup()


def test_api_response_adds_fields_without_leaking_secrets(
    license_env: Path, client: TestClient, monkeypatch
) -> None:
    monkeypatch.setattr(settings, "license_signing_key", KEY)
    service.build_file(_payload(), signing_key=KEY, path=license_env)
    service.invalidate_cache()

    body = client.get("/api/license/status", headers=login(client)).json()
    assert body["status"] == "active"
    assert body["source"] == "file"
    assert body["client_name"] == "شركة السويس لمشتقات الميثانول"
    assert body["issued_on"] == (date.today() - timedelta(days=10)).isoformat()
    assert body["hardware_matches"] is True
    assert body["license_key_present"] is True
    assert body["mode"] in {"demo", "production"}
    assert body["enforced"] is False
    serialized = json.dumps(body, ensure_ascii=False)
    assert KEY not in serialized
    assert HARDWARE not in serialized
    assert "signature" not in serialized


def test_api_never_returns_500_for_broken_file(
    license_env: Path, client: TestClient
) -> None:
    license_env.write_text("{{{", encoding="utf-8")
    service.invalidate_cache()
    response = client.get("/api/license/status", headers=login(client))
    assert response.status_code == 200
    assert response.json()["status"] == "invalid"
    assert response.json()["message"]


def test_cli_generate_and_verify(tmp_path: Path) -> None:
    env = os.environ.copy()
    env["DATABASE_URL"] = "sqlite+pysqlite://"
    env["SECRET_KEY"] = "test-secret-key"
    env["LICENSE_SIGNING_KEY"] = KEY
    env["LICENSE_HARDWARE_ID"] = HARDWARE
    target = tmp_path / "license.json"

    def run(*args: str) -> subprocess.CompletedProcess[str]:
        # This sandbox's Python runs with `sys.flags.safe_path = True`, which
        # drops the cwd from sys.path. Insert it explicitly; in Docker the
        # documented `python -m app.cli.license ...` works unchanged.
        return subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys; sys.path.insert(0, '.'); "
                "from app.cli.license import main; raise SystemExit(main())",
                *args,
            ],
            cwd=API_DIR,
            env=env,
            capture_output=True,
            text=True,
        )

    assert run("hardware-id").stdout.strip() == HARDWARE
    generated = run(
        "generate",
        "--client",
        "شركة الاختبار",
        "--hardware-id",
        HARDWARE,
        "--issued",
        (date.today() - timedelta(days=1)).isoformat(),
        "--expires",
        (date.today() + timedelta(days=30)).isoformat(),
        "--out",
        str(target),
    )
    assert generated.returncode == 0, generated.stdout + generated.stderr
    assert KEY not in generated.stdout + generated.stderr

    verified = run("verify", "--file", str(target))
    assert verified.returncode == 0, verified.stdout + verified.stderr
    assert KEY not in verified.stdout + verified.stderr

    raw = json.loads(target.read_text(encoding="utf-8"))
    assert raw["signature"]
    assert raw["client_name"] == "شركة الاختبار"
