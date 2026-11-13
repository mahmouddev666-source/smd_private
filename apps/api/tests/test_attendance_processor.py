"""Attendance mapping rules for biometric punches.

These tests exercise `app.services.attendance_processor` directly against the
in-memory database, without any network or ZKTeco terminal.
"""

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.services import attendance_processor as processor
from app.utils.ids import new_id

DAY = date(2026, 11, 12)


def _employee(db: Session, employee_id: str = "9001", shift: str = "NORMAL_DAY") -> Employee:
    employee = Employee(
        id=new_id(),
        employee_id=employee_id,
        name=f"موظف {employee_id}",
        department="التشغيل",
        current_title="فني",
        hire_date=date(2020, 1, 1),
        hourly_rate=Decimal("90.00"),
        default_shift=shift,
        is_active=True,
        is_demo=True,
    )
    db.add(employee)
    db.commit()
    return employee


def _device(db: Session, name: str = "جهاز البوابة") -> ZktecoDevice:
    device = ZktecoDevice(
        id=new_id(),
        name=name,
        ip_address="192.168.1.50",
        port=4370,
        comm_key="",
        location="البوابة",
        model="K40",
        is_demo=True,
    )
    db.add(device)
    db.commit()
    return device


def _punch(db: Session, device: ZktecoDevice, enroll: str, moment: datetime) -> BiometricPunch:
    punch = BiometricPunch(
        id=new_id(),
        device_id=device.id,
        enroll_number=enroll,
        punch_time=moment,
        punch_type="دخول",
        verify_mode="بصمة إصبع",
        is_demo=True,
    )
    db.add(punch)
    db.commit()
    return punch


def _attendance(db: Session, employee_id: str, day: date = DAY) -> Attendance | None:
    return db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee_id, Attendance.date == day
        )
    )


def test_day_shift_uses_earliest_and_latest_punch(db: Session) -> None:
    employee = _employee(db, shift="DAY_SHIFT")
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 7, 55))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 20, 5))

    stats = processor.process_device_punches(db, device)

    assert stats.created == 1
    row = _attendance(db, employee.employee_id)
    assert row is not None
    assert row.check_in == time(7, 55)
    assert row.check_out == time(20, 5)
    assert row.overtime_minutes == 5
    assert row.late_minutes == 0
    assert row.status == "إضافي"


def test_single_punch_is_check_in_only(db: Session) -> None:
    employee = _employee(db, shift="NORMAL_DAY")
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 30))

    processor.process_device_punches(db, device)

    row = _attendance(db, employee.employee_id)
    assert row is not None
    assert row.check_in == time(8, 30)
    assert row.check_out is None
    assert row.late_minutes == 30
    assert row.status == "متأخر"


def test_night_shift_overnight_is_one_row(db: Session) -> None:
    employee = _employee(db, shift="NIGHT_SHIFT")
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 20, 0))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 13, 8, 5))

    stats = processor.process_device_punches(db, device)

    assert stats.created == 1
    assert db.scalar(select(Attendance).where(Attendance.employee_id == employee.employee_id)) is not None
    rows = db.scalars(
        select(Attendance).where(Attendance.employee_id == employee.employee_id)
    ).all()
    assert len(rows) == 1  # 20:00 and 08:05 share one business day
    row = rows[0]
    assert row.date == DAY
    assert row.check_in == time(20, 0)
    assert row.check_out == time(8, 5)
    assert row.overtime_minutes == 5
    assert row.status == "إضافي"


def test_day_shift_checkout_after_midnight_belongs_to_previous_day(db: Session) -> None:
    employee = _employee(db, shift="NORMAL_DAY")
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 0))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 13, 0, 30))

    processor.process_device_punches(db, device)

    row = _attendance(db, employee.employee_id)
    assert row is not None
    assert row.date == DAY
    assert row.check_out == time(0, 30)
    assert row.overtime_minutes == 8 * 60 + 30  # 16:00 -> 00:30
    assert _attendance(db, employee.employee_id, date(2026, 11, 13)) is None


def test_repeated_sync_does_not_duplicate_rows(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 7, 55))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 20, 0))

    first = processor.process_device_punches(db, device)
    second = processor.process_device_punches(db, device)

    assert first.created == 1
    assert second.created == 0
    assert second.unchanged == 1
    rows = db.scalars(
        select(Attendance).where(Attendance.employee_id == employee.employee_id)
    ).all()
    assert len(rows) == 1


def test_late_punch_merges_into_existing_biometric_row(db: Session) -> None:
    employee = _employee(db, shift="NORMAL_DAY")
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 0))
    processor.process_device_punches(db, device)

    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 19, 45))
    stats = processor.process_device_punches(db, device)

    assert stats.updated == 1
    row = _attendance(db, employee.employee_id)
    assert row is not None
    assert row.check_out == time(19, 45)
    assert row.overtime_minutes == 3 * 60 + 45


def test_manual_attendance_is_never_overwritten(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    manual = Attendance(
        id=new_id(),
        employee_id=employee.employee_id,
        date=DAY,
        check_in=time(9, 0),
        check_out=time(17, 0),
        status="حاضر",
        notes="تسجيل يدوي من الموارد البشرية",
        is_demo=True,
    )
    db.add(manual)
    db.commit()
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 7, 50))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 20, 0))

    stats = processor.process_device_punches(db, device)

    assert stats.skipped_manual == 1
    db.refresh(manual)
    assert manual.check_in == time(9, 0)
    assert manual.check_out == time(17, 0)
    assert manual.notes == "تسجيل يدوي من الموارد البشرية"


def test_unknown_pin_is_counted_and_not_mapped(db: Session) -> None:
    device = _device(db)
    _punch(db, device, "7777", datetime(2026, 11, 12, 9, 12))

    stats = processor.process_device_punches(db, device)

    assert stats.unknown == 1
    assert stats.created == 0
    assert db.scalars(select(Attendance)).all() == []


def test_ignored_punch_is_skipped(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    punch = _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 0))
    punch.ignored_at = datetime(2026, 11, 12, 9, 0)
    db.commit()

    stats = processor.process_device_punches(db, device)

    assert stats.created == 0
    assert _attendance(db, employee.employee_id) is None


def test_resolved_punch_uses_employee_shift(db: Session) -> None:
    employee = _employee(db, shift="NIGHT_SHIFT")
    device = _device(db)
    punch = _punch(db, device, "7777", datetime(2026, 11, 12, 20, 0))
    punch.resolved_employee_id = employee.employee_id
    db.commit()

    stats = processor.process_device_punches(db, device)

    assert stats.created == 1
    row = _attendance(db, employee.employee_id)
    assert row is not None and row.check_in == time(20, 0)
