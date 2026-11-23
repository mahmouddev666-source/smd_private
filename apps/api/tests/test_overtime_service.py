"""Phase B: the overtime service reads work_settings instead of constants."""

from datetime import date, datetime, time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.audit import AuditLog
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.models.user import User
from app.schemas.settings import WorkSettingsUpdate
from app.services import attendance_processor as processor
from app.services import overtime as overtime_service
from app.services import settings as settings_service
from app.utils.ids import new_id

DAY = date(2026, 11, 12)


def _admin(db: Session) -> User:
    return db.query(User).filter(User.username == "admin").one()


def _employee(db: Session, shift: str = "NORMAL_DAY", employee_id: str = "9001") -> Employee:
    employee = Employee(
        id=new_id(),
        employee_id=employee_id,
        name=f"موظف {employee_id}",
        department="التشغيل",
        current_title="فني",
        hire_date=date(2020, 1, 1),
        hourly_rate=Decimal("150.00"),
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
        ip_address="192.168.1.51",
        port=4370,
        comm_key="",
        location="البوابة",
        model="K40",
        is_demo=True,
    )
    db.add(device)
    db.commit()
    return device


def _punch(db: Session, device: ZktecoDevice, enroll: str, moment: datetime) -> None:
    db.add(
        BiometricPunch(
            id=new_id(),
            device_id=device.id,
            enroll_number=enroll,
            punch_time=moment,
            punch_type="دخول",
            verify_mode="بصمة إصبع",
            is_demo=True,
        )
    )
    db.commit()


def test_golden_normal_day_split_and_pay() -> None:
    rules = overtime_service.OvertimeRules.defaults()

    # Approved example: normal day ends 16:00, works until 20:00.
    split = overtime_service.split_overtime_minutes(16 * 60, 20 * 60, rules)
    assert split.day_minutes == 120
    assert split.night_minutes == 120
    assert split.total_minutes == 240

    result = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("150"), rules
    )
    assert result.is_valid is True
    assert result.total_overtime_hours == Decimal("4.00")
    assert result.day_overtime_hours == Decimal("2.00")
    assert result.night_overtime_hours == Decimal("2.00")
    assert result.day_overtime_pay == Decimal("405.00")
    assert result.night_overtime_pay == Decimal("510.00")
    assert result.total_overtime_pay == Decimal("915.00")
    assert result.effective_paid_hours == Decimal("6.10")


def test_golden_midnight_to_two_am_is_night_pay() -> None:
    rules = overtime_service.OvertimeRules.defaults()
    split = overtime_service.split_overtime_minutes(0, 2 * 60, rules)
    assert split.day_minutes == 0
    assert split.night_minutes == 120
    assert split.total_minutes == 120
    # 2h * 100 * 1.70 = 340
    assert split.night_hours * Decimal("100") * rules.night_multiplier == Decimal("340.00")
    # The split helper never double-counts: day + night equals the interval.
    assert split.day_minutes + split.night_minutes == split.total_minutes


def test_changing_cutoff_and_multipliers_changes_the_result(db: Session) -> None:
    # Approved defaults: 2h day @1.35 + 2h night @1.70 = 610 for rate 100.
    default_rules = overtime_service.OvertimeRules.defaults()
    default_result = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("100"), default_rules
    )
    assert default_result.total_overtime_pay == Decimal("610.00")

    settings_service.update_work_settings(
        db,
        WorkSettingsUpdate(
            overtime_cutoff="20:00",
            overtime_day_multiplier=1.5,
            overtime_night_multiplier=2.0,
            expected_version=1,
        ),
        _admin(db),
    )
    updated_rules = overtime_service.rules_for(db)
    updated_result = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("100"), updated_rules
    )
    assert updated_result.day_overtime_hours == Decimal("4.00")
    assert updated_result.night_overtime_hours == Decimal("0.00")
    assert updated_result.day_overtime_pay == Decimal("600.00")
    assert updated_result.night_overtime_pay == Decimal("0.00")
    assert updated_result.total_overtime_pay == Decimal("600.00")
    assert updated_result.total_overtime_pay != default_result.total_overtime_pay

    # A different cutoff moves one hour back to the night bracket.
    settings_service.update_work_settings(
        db,
        WorkSettingsUpdate(overtime_cutoff="17:00", expected_version=2),
        _admin(db),
    )
    split_rules = overtime_service.rules_for(db)
    split_result = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("100"), split_rules
    )
    assert split_result.day_overtime_hours == Decimal("1.00")
    assert split_result.night_overtime_hours == Decimal("3.00")
    assert split_result.total_overtime_pay == Decimal("750.00")


def test_attendance_processor_uses_the_dynamic_cutoff(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 0))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 20, 0))

    processor.process_device_punches(db, device)
    row = db.query(Attendance).one()
    assert row.overtime_minutes == 240

    first_audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "create", AuditLog.entity == "attendance")
        .order_by(AuditLog.created_at)
        .all()[-1]
    )
    assert first_audit.after["day_overtime_minutes"] == 120
    assert first_audit.after["night_overtime_minutes"] == 120

    settings_service.update_work_settings(
        db,
        WorkSettingsUpdate(overtime_cutoff="20:00", expected_version=1),
        _admin(db),
    )
    db.query(Attendance).delete()
    db.commit()

    processor.process_device_punches(db, device)
    row = db.query(Attendance).one()
    # The total hours do not change with the boundary; the split does.
    assert row.overtime_minutes == 240

    second_audit = (
        db.query(AuditLog)
        .filter(AuditLog.action == "create", AuditLog.entity == "attendance")
        .order_by(AuditLog.created_at)
        .all()[-1]
    )
    assert second_audit.after["day_overtime_minutes"] == 240
    assert second_audit.after["night_overtime_minutes"] == 0


def test_attendance_processor_uses_the_late_grace_setting(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 8, 10))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 16, 0))

    processor.process_device_punches(db, device)
    assert db.query(Attendance).one().status == "حاضر"  # 10 <= 15

    settings_service.update_work_settings(
        db,
        WorkSettingsUpdate(late_grace_minutes=5, expected_version=1),
        _admin(db),
    )
    db.query(Attendance).delete()
    db.commit()

    processor.process_device_punches(db, device)
    assert db.query(Attendance).one().status == "متأخر"


def test_arrival_after_shift_end_does_not_create_phantom_overtime(db: Session) -> None:
    employee = _employee(db)
    device = _device(db)
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 17, 0))
    _punch(db, device, employee.employee_id, datetime(2026, 11, 12, 18, 0))

    processor.process_device_punches(db, device)
    row = db.query(Attendance).one()
    # 16:00-17:00 was never worked; only 17:00-18:00 is overtime.
    assert row.overtime_minutes == 60


def test_no_double_counting_and_no_nan() -> None:
    rules = overtime_service.OvertimeRules.defaults()
    result = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("150"), rules
    )
    assert result.day_overtime_hours + result.night_overtime_hours == result.total_overtime_hours
    assert result.day_overtime_pay + result.night_overtime_pay == result.total_overtime_pay

    invalid = overtime_service.calculate_overtime(
        "NORMAL_DAY", "not-a-time", "20:00", Decimal("150"), rules
    )
    assert invalid.is_valid is False
    assert invalid.total_overtime_pay == Decimal("0.00")
    assert invalid.total_overtime_hours.is_finite()

    invalid_rate = overtime_service.calculate_overtime(
        "NORMAL_DAY", "08:00", "20:00", Decimal("NaN"), rules
    )
    assert invalid_rate.total_overtime_pay == Decimal("0.00")
    assert invalid_rate.total_overtime_pay.is_finite()
