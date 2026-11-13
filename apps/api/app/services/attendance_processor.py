"""Map raw biometric punches to daily attendance rows.

Rules (mirroring `src/utils/overtimeCalculator.ts`):

- `NORMAL_DAY` 08:00 → 16:00, `DAY_SHIFT` 08:00 → 20:00: the earliest punch of
  the business day is the check-in, the latest is the check-out. A punch after
  midnight (before 04:00) belongs to the previous business day (overtime).
- `NIGHT_SHIFT` 20:00 → 08:00: any punch before noon belongs to the previous
  evening's business day, so 20:00 → 08:05 next morning is a single row.
- Repeated 10-minute syncs merge into the same `(employee_id, date)` row; the
  unique constraint in the database is the final guard against duplicates.
- A manual HR record is never overwritten by biometric data.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.attendance import Attendance
from app.models.device import BiometricPunch, ZktecoDevice
from app.models.employee import Employee
from app.models.user import User
from app.services.audit import record_audit
from app.utils.ids import new_id

BIOMETRIC_NOTE_PREFIX = "مزامنة تلقائية من جهاز البصمة"
LATE_GRACE_MINUTES = 15
EARLY_LEAVE_GRACE_MINUTES = 15


@dataclass(frozen=True)
class ShiftWindow:
    """Shift boundaries in minutes from midnight; end may exceed 1440."""

    start_minutes: int
    end_minutes: int
    crosses_midnight: bool


SHIFT_WINDOWS: dict[str, ShiftWindow] = {
    "NORMAL_DAY": ShiftWindow(8 * 60, 16 * 60, False),
    "DAY_SHIFT": ShiftWindow(8 * 60, 20 * 60, False),
    "NIGHT_SHIFT": ShiftWindow(20 * 60, 32 * 60, True),
}


def shift_window(shift: str | None) -> ShiftWindow:
    return SHIFT_WINDOWS.get(shift or "", SHIFT_WINDOWS["NORMAL_DAY"])


def business_date(punch: datetime, window: ShiftWindow) -> date:
    """Return the attendance day a punch belongs to."""
    if window.crosses_midnight:
        # Night shift: everything before noon is the tail of the previous shift.
        if punch.hour < 12:
            return (punch - timedelta(days=1)).date()
        return punch.date()
    # Day shifts: a checkout after midnight belongs to the previous day.
    if punch.hour < 4:
        return (punch - timedelta(days=1)).date()
    return punch.date()


@dataclass(frozen=True)
class DaySummary:
    check_in: time
    check_out: time | None
    status: str
    overtime_minutes: int
    late_minutes: int
    early_leave_minutes: int


def summarize_day(punches: list[datetime], window: ShiftWindow) -> DaySummary:
    """Turn all punches of one business day into check-in/out and HR metrics."""
    ordered = sorted(punches)
    first = ordered[0]
    in_minutes = first.hour * 60 + first.minute
    if window.crosses_midnight and in_minutes < 12 * 60:
        in_minutes += 24 * 60

    last = ordered[-1]
    out_minutes = last.hour * 60 + last.minute
    while out_minutes < in_minutes:
        out_minutes += 24 * 60

    # A single touch (or two touches in the same minute) is only a check-in.
    has_check_out = len(ordered) > 1 and out_minutes - in_minutes >= 1

    late = max(0, in_minutes - window.start_minutes)
    early = max(0, window.end_minutes - out_minutes) if has_check_out else 0
    overtime = max(0, out_minutes - window.end_minutes) if has_check_out else 0

    if overtime > 0:
        status = "إضافي"
    elif late > LATE_GRACE_MINUTES:
        status = "متأخر"
    elif early > EARLY_LEAVE_GRACE_MINUTES:
        status = "انصراف مبكر"
    else:
        status = "حاضر"

    return DaySummary(
        check_in=first.time().replace(second=0, microsecond=0),
        check_out=last.time().replace(second=0, microsecond=0) if has_check_out else None,
        status=status,
        overtime_minutes=overtime,
        late_minutes=late,
        early_leave_minutes=early,
    )


@dataclass
class ProcessingStats:
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    skipped_manual: int = 0
    unknown: int = 0


def process_device_punches(
    db: Session,
    device: ZktecoDevice,
    actor: User | None = None,
    since: datetime | None = None,
) -> ProcessingStats:
    """Map every stored punch of a device to attendance (idempotent)."""
    stmt = select(BiometricPunch).where(BiometricPunch.device_id == device.id)
    if since is not None:
        stmt = stmt.where(BiometricPunch.punch_time >= since)
    punches = list(db.scalars(stmt.order_by(BiometricPunch.punch_time)).all())
    employees = {row.employee_id: row for row in db.scalars(select(Employee)).all()}
    return process_punches(db, punches, employees, device, actor)


def process_punches(
    db: Session,
    punches: list[BiometricPunch],
    employees: dict[str, Employee],
    device: ZktecoDevice,
    actor: User | None = None,
) -> ProcessingStats:
    stats = ProcessingStats()
    groups: dict[tuple[str, date], list[datetime]] = defaultdict(list)

    for punch in punches:
        if punch.ignored_at is not None:
            continue
        employee_id = punch.resolved_employee_id or punch.enroll_number
        employee = employees.get(employee_id)
        if employee is None:
            stats.unknown += 1
            continue
        window = shift_window(employee.default_shift)
        groups[(employee.employee_id, business_date(punch.punch_time, window))].append(
            punch.punch_time
        )

    for (employee_id, day), times in sorted(groups.items()):
        employee = employees[employee_id]
        summary = summarize_day(times, shift_window(employee.default_shift))
        outcome = _upsert_attendance(db, employee, day, summary, device, actor)
        setattr(stats, outcome, getattr(stats, outcome) + 1)

    db.commit()
    return stats


def _min_time(current: time | None, candidate: time | None) -> time | None:
    if current is None:
        return candidate
    if candidate is None:
        return current
    return min(current, candidate)


def _max_time(current: time | None, candidate: time | None) -> time | None:
    if current is None:
        return candidate
    if candidate is None:
        return current
    return max(current, candidate)


def _upsert_attendance(
    db: Session,
    employee: Employee,
    day: date,
    summary: DaySummary,
    device: ZktecoDevice,
    actor: User | None,
) -> str:
    """Create/merge one attendance row. Returns the stats field to increment."""
    existing = db.scalar(
        select(Attendance).where(
            Attendance.employee_id == employee.employee_id,
            Attendance.date == day,
        )
    )
    note = f"{BIOMETRIC_NOTE_PREFIX} — {device.name}"

    if existing is None:
        record = Attendance(
            id=new_id(),
            employee_id=employee.employee_id,
            date=day,
            check_in=summary.check_in,
            check_out=summary.check_out,
            status=summary.status,
            overtime_minutes=summary.overtime_minutes,
            late_minutes=summary.late_minutes,
            early_leave_minutes=summary.early_leave_minutes,
            notes=note,
            is_demo=employee.is_demo,
        )
        db.add(record)
        record_audit(
            db,
            actor=actor,
            action="create",
            entity="attendance",
            entity_id=f"{employee.employee_id}:{day.isoformat()}",
            after={
                "check_in": str(summary.check_in),
                "check_out": str(summary.check_out),
                "source": "zkteco",
            },
        )
        return "created"

    # Manual HR entries are authoritative: never overwrite them with punches.
    if not existing.notes.startswith(BIOMETRIC_NOTE_PREFIX):
        return "skipped_manual"

    check_in = _min_time(existing.check_in, summary.check_in)
    check_out = _max_time(existing.check_out, summary.check_out)

    unchanged = (
        existing.check_in == check_in
        and existing.check_out == check_out
        and existing.status == summary.status
        and existing.overtime_minutes == summary.overtime_minutes
        and existing.late_minutes == summary.late_minutes
        and existing.early_leave_minutes == summary.early_leave_minutes
    )
    if unchanged:
        return "unchanged"

    existing.check_in = check_in
    existing.check_out = check_out
    existing.status = summary.status
    existing.overtime_minutes = summary.overtime_minutes
    existing.late_minutes = summary.late_minutes
    existing.early_leave_minutes = summary.early_leave_minutes
    existing.notes = note
    record_audit(
        db,
        actor=actor,
        action="update",
        entity="attendance",
        entity_id=f"{employee.employee_id}:{day.isoformat()}",
        after={
            "check_in": str(check_in),
            "check_out": str(check_out),
            "source": "zkteco",
        },
    )
    return "updated"
