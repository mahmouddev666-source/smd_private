"""T3-19: work_settings API, DB constraints and attendance integration."""

import os
import sqlite3
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.models.settings import WorkSettings
from app.models.audit import AuditLog
from app.schemas.settings import WorkSettingsUpdate
from app.services import attendance_processor as processor
from app.services import settings as settings_service
from app.utils.ids import new_id
from tests.conftest import login

API_DIR = Path(__file__).resolve().parents[1]
DAY = date(2026, 11, 12)


def test_get_returns_approved_defaults_and_enforces_roles(client: TestClient) -> None:
    body = client.get("/api/settings/work", headers=login(client, "admin")).json()
    assert body["id"] == 1
    assert body["timezone"] == "Africa/Cairo"
    assert body["normal_start"] == "08:00" and body["normal_end"] == "16:00"
    assert body["day_start"] == "08:00" and body["day_end"] == "20:00"
    assert body["night_start"] == "20:00" and body["night_end"] == "08:00"
    assert body["overtime_cutoff"] == "18:00"
    assert body["overtime_day_multiplier"] == 1.35
    assert body["overtime_night_multiplier"] == 1.7
    assert body["late_grace_minutes"] == 15
    assert body["version"] == 1

    for role in ("supervisor", "viewer"):
        response = client.get("/api/settings/work", headers=login(client, role))
        assert response.status_code == 403
        assert response.json()["code"] == "FORBIDDEN"


def test_patch_version_audit_and_conflict(client: TestClient, db: Session) -> None:
    headers = login(client, "hr")
    response = client.patch(
        "/api/settings/work",
        json={"normal_start": "09:00", "overtime_night_multiplier": 1.8, "expected_version": 1},
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["normal_start"] == "09:00"
    assert body["overtime_night_multiplier"] == 1.8
    assert body["version"] == 2
    assert body["night_start"] == "20:00"  # untouched field

    log = db.query(AuditLog).filter(AuditLog.action == "settings.work.update").one()
    assert log.entity == "settings" and log.entity_id == "work"
    assert log.before["normal_start"] == "08:00"
    assert log.after["normal_start"] == "09:00"
    assert log.after["version"] == 2

    conflict = client.patch(
        "/api/settings/work", json={"normal_end": "17:00", "expected_version": 1}, headers=headers
    )
    assert conflict.status_code == 409
    assert conflict.json()["code"] == "SETTINGS_VERSION_CONFLICT"

    for role in ("supervisor", "viewer"):
        denied = client.patch("/api/settings/work", json={"normal_start": "07:00"}, headers=login(client, role))
        assert denied.status_code == 403


def test_patch_validation(client: TestClient) -> None:
    headers = login(client, "admin")
    for payload in (
        {"overtime_day_multiplier": 0},
        {"overtime_night_multiplier": 6},
        {"late_grace_minutes": 121},
        {"normal_start": "08:00", "normal_end": "08:00"},
    ):
        response = client.patch("/api/settings/work", json=payload, headers=headers)
        assert response.status_code == 422, (payload, response.text)


def test_singleton_constraint_and_fallback(db: Session) -> None:
    # No seed row: reads use constants without writing.
    assert settings_service.get_work_settings(db).normal_start.strftime("%H:%M") == "08:00"
    assert db.query(WorkSettings).count() == 0

    db.add(
        WorkSettings(
            id=1,
            timezone="Africa/Cairo",
            normal_start=datetime(2026, 1, 1, 8).time(),
            normal_end=datetime(2026, 1, 1, 16).time(),
            day_start=datetime(2026, 1, 1, 8).time(),
            day_end=datetime(2026, 1, 1, 20).time(),
            night_start=datetime(2026, 1, 1, 20).time(),
            night_end=datetime(2026, 1, 1, 8).time(),
            overtime_day_start=datetime(2026, 1, 1, 6).time(),
            overtime_cutoff=datetime(2026, 1, 1, 18).time(),
            overtime_day_multiplier=1.35,
            overtime_night_multiplier=1.70,
            late_grace_minutes=15,
            version=1,
        )
    )
    db.commit()
    db.add(WorkSettings(id=2))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def _employee(db: Session, shift: str = "NORMAL_DAY") -> Employee:
    employee = Employee(
        id=new_id(),
        employee_id="9001",
        name="موظف اختبار",
        department="التشغيل",
        current_title="فني",
        hire_date=date(2020, 1, 1),
        default_shift=shift,
        is_active=True,
        is_demo=True,
    )
    db.add(employee)
    db.commit()
    return employee


def _device(db: Session) -> ZktecoDevice:
    device = ZktecoDevice(
        id=new_id(),
        name="جهاز الاختبار",
        ip_address="10.0.0.9",
        port=4370,
        comm_key="",
        location="البوابة",
        model="K40",
        is_demo=True,
    )
    db.add(device)
    db.commit()
    return device


def test_attendance_uses_custom_shift_from_db(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    db.add(
        BiometricPunch(
            id=new_id(),
            device_id=device.id,
            enroll_number=employee.employee_id,
            punch_time=datetime(2026, 11, 12, 9, 30),
            punch_type="دخول",
            verify_mode="بصمة إصبع",
            is_demo=True,
        )
    )
    db.commit()

    # Default 08:00 start -> 90 minutes late.
    processor.process_device_punches(db, device)
    row = db.query(Attendance).one()
    assert row.late_minutes == 90
    assert row.status == "متأخر"

    # HR moves the shift to 10:00; a new batch gives a different result.
    from app.models.user import User

    user = db.query(User).filter(User.username == "admin").one()
    settings_service.update_work_settings(db, WorkSettingsUpdate(normal_start="10:00"), user)
    db.query(Attendance).delete()
    db.commit()

    processor.process_device_punches(db, device)
    row = db.query(Attendance).one()
    assert row.late_minutes == 0
    assert row.status == "حاضر"


def test_work_settings_migration_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "settings.db"
    env = os.environ.copy()
    env["DATABASE_URL"] = f"sqlite:///{db_path.as_posix()}"
    env["SECRET_KEY"] = "test-secret-key"

    def run(*args: str) -> None:
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *args],
            cwd=API_DIR,
            env=env,
            capture_output=True,
            text=True,
        )
        assert result.returncode == 0, result.stdout + result.stderr

    run("upgrade", "head")
    connection = sqlite3.connect(db_path)
    row = connection.execute(
        "SELECT id, normal_start, normal_end, night_start, night_end, overtime_cutoff, "
        "overtime_day_multiplier, overtime_night_multiplier, late_grace_minutes, version "
        "FROM work_settings"
    ).fetchone()
    assert row == (1, "08:00", "16:00", "20:00", "08:00", "18:00", 1.35, 1.70, 15, 1)
    connection.close()

    run("downgrade", "f3c1a9d2b7e4")
    connection = sqlite3.connect(db_path)
    tables = {r[0] for r in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert "work_settings" not in tables
    connection.close()

    run("upgrade", "head")
    connection = sqlite3.connect(db_path)
    assert connection.execute("SELECT COUNT(*) FROM work_settings").fetchone()[0] == 1
    connection.close()
