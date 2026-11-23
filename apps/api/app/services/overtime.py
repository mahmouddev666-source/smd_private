"""Approved overtime calculation shared by the attendance mapper (Phase B).

All business values come from the singleton ``work_settings`` row (T3-19)
instead of hard-coded constants:

- shift windows: ``normal_start/end``, ``day_start/end``, ``night_start/end``
- day/night overtime boundary: ``overtime_day_start`` / ``overtime_cutoff``
- multipliers: ``overtime_day_multiplier`` / ``overtime_night_multiplier``
- lateness grace: ``late_grace_minutes``

The algorithm mirrors ``src/utils/overtimeCalculator.ts`` so the browser and
the server report the same split. Money and hours are kept as ``Decimal`` and
rounded only at the result edge. Invalid input never produces ``NaN``.

Changing settings affects future attendance syncs and future calculations;
existing attendance rows are never rewritten automatically (the same decision
documented in :mod:`app.services.settings`).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, time
from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.services import settings as settings_service
from app.services.settings import WorkSettingsValues

HOURS_QUANT = Decimal("0.01")
MONEY_QUANT = Decimal("0.01")
MAX_INTERVAL_MINUTES = 7 * 24 * 60
_CLOCK_PATTERN = re.compile(r"^(\d{1,2})[:.](\d{1,2})(?:[:.]\d{1,2})?$")


def time_to_minutes(value: time) -> int:
    """Convert a ``datetime.time`` into minutes from midnight."""
    return value.hour * 60 + value.minute


def clock_to_minutes(value: time | datetime | str) -> int | None:
    """Parse ``time``/``datetime``/``"HH:MM[:SS]"`` into minutes or ``None``."""
    if isinstance(value, datetime):
        return value.hour * 60 + value.minute
    if isinstance(value, time):
        return value.hour * 60 + value.minute
    if isinstance(value, str):
        match = _CLOCK_PATTERN.fullmatch(value.strip())
        if match is None:
            return None
        hours, minutes = int(match.group(1)), int(match.group(2))
        if hours > 23 or minutes > 59:
            return None
        return hours * 60 + minutes
    return None


def _round_hours(minutes: int) -> Decimal:
    return (Decimal(minutes) / Decimal(60)).quantize(HOURS_QUANT, rounding=ROUND_HALF_UP)


def _round_money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_QUANT, rounding=ROUND_HALF_UP)


def _as_decimal(value: Decimal | float | int | str) -> Decimal:
    try:
        parsed = value if isinstance(value, Decimal) else Decimal(str(value))
    except Exception:
        return Decimal("0")
    if not parsed.is_finite() or parsed < 0:
        return Decimal("0")
    return parsed


@dataclass(frozen=True)
class OvertimeRules:
    """Everything the calculator needs, loaded once from the settings row."""

    day_start_minutes: int
    cutoff_minutes: int
    day_multiplier: Decimal
    night_multiplier: Decimal
    late_grace_minutes: int
    shift_windows: dict[str, tuple[int, int, bool]]

    @classmethod
    def from_settings(cls, values: WorkSettingsValues) -> "OvertimeRules":
        return cls(
            day_start_minutes=time_to_minutes(values.overtime_day_start),
            cutoff_minutes=time_to_minutes(values.overtime_cutoff),
            day_multiplier=Decimal(values.overtime_day_multiplier),
            night_multiplier=Decimal(values.overtime_night_multiplier),
            late_grace_minutes=values.late_grace_minutes,
            shift_windows=values.shift_windows(),
        )

    @classmethod
    def defaults(cls) -> "OvertimeRules":
        """Approved defaults used when no database row exists yet."""
        return cls.from_settings(WorkSettingsValues())


def rules_for(db: Session) -> OvertimeRules:
    """Read the singleton row (or approved defaults) once for a batch/job."""
    return OvertimeRules.from_settings(settings_service.get_work_settings(db))


@dataclass(frozen=True)
class OvertimeSplit:
    day_minutes: int
    night_minutes: int

    @property
    def total_minutes(self) -> int:
        return self.day_minutes + self.night_minutes

    @property
    def day_hours(self) -> Decimal:
        return _round_hours(self.day_minutes)

    @property
    def night_hours(self) -> Decimal:
        return _round_hours(self.night_minutes)

    @property
    def total_hours(self) -> Decimal:
        return _round_hours(self.total_minutes)


def _is_day_minute(clock_minute: int, day_start: int, cutoff: int) -> bool:
    """True when the clock minute belongs to the paid day bracket.

    The approved window is ``[overtime_day_start, overtime_cutoff)``. A wrapped
    window is supported for future HR decisions, and an equal pair is treated
    as "no day bracket" rather than silently counting every minute twice.
    """
    if day_start < cutoff:
        return day_start <= clock_minute < cutoff
    if day_start > cutoff:
        return clock_minute >= day_start or clock_minute < cutoff
    return False


def split_overtime_minutes(
    start_minutes: int,
    end_minutes: int,
    rules: OvertimeRules,
) -> OvertimeSplit:
    """Split an overtime interval into day/night minutes using settings."""
    safe_start = max(0, int(start_minutes))
    safe_end = max(safe_start, int(end_minutes))
    capped_end = min(safe_end, safe_start + MAX_INTERVAL_MINUTES)
    day = 0
    night = 0
    for minute in range(safe_start, capped_end):
        clock_minute = minute % (24 * 60)
        if _is_day_minute(clock_minute, rules.day_start_minutes, rules.cutoff_minutes):
            day += 1
        else:
            night += 1
    return OvertimeSplit(day_minutes=day, night_minutes=night)


@dataclass(frozen=True)
class OvertimeResult:
    is_valid: bool
    standard_hours: Decimal
    actual_worked_hours: Decimal
    total_overtime_hours: Decimal
    day_overtime_hours: Decimal
    night_overtime_hours: Decimal
    day_multiplier: Decimal
    night_multiplier: Decimal
    effective_paid_hours: Decimal
    day_overtime_pay: Decimal
    night_overtime_pay: Decimal
    total_overtime_pay: Decimal
    late_minutes: int
    early_leave_minutes: int
    explanation: str


def _empty_result(standard_hours: Decimal, rules: OvertimeRules, message: str) -> OvertimeResult:
    return OvertimeResult(
        is_valid=False,
        standard_hours=standard_hours,
        actual_worked_hours=Decimal("0.00"),
        total_overtime_hours=Decimal("0.00"),
        day_overtime_hours=Decimal("0.00"),
        night_overtime_hours=Decimal("0.00"),
        day_multiplier=rules.day_multiplier,
        night_multiplier=rules.night_multiplier,
        effective_paid_hours=Decimal("0.00"),
        day_overtime_pay=Decimal("0.00"),
        night_overtime_pay=Decimal("0.00"),
        total_overtime_pay=Decimal("0.00"),
        late_minutes=0,
        early_leave_minutes=0,
        explanation=message,
    )


def calculate_overtime(
    shift_type: str,
    check_in: time | datetime | str,
    check_out: time | datetime | str,
    hourly_rate: Decimal | float | int | str,
    rules: OvertimeRules | None = None,
) -> OvertimeResult:
    """Return the approved split/pay for one shift without any NaN risk."""
    active_rules = rules or OvertimeRules.defaults()
    start, end, _crosses = active_rules.shift_windows.get(
        shift_type, active_rules.shift_windows["NORMAL_DAY"]
    )
    if end <= start:
        end += 24 * 60
    standard_hours = _round_hours(end - start)

    parsed_in = clock_to_minutes(check_in)
    parsed_out = clock_to_minutes(check_out)
    if parsed_in is None or parsed_out is None:
        return _empty_result(
            standard_hours,
            active_rules,
            "وقت الحضور أو الانصراف غير صالح. يرجى إدخاله بصيغة 24 ساعة (مثال: 08:00).",
        )

    in_minutes = parsed_in
    if shift_type == "NIGHT_SHIFT" and in_minutes < 12 * 60:
        # A night-shift arrival after midnight belongs to the previous evening.
        in_minutes += 24 * 60
    out_minutes = parsed_out
    while out_minutes < in_minutes:
        out_minutes += 24 * 60

    total_worked_minutes = out_minutes - in_minutes
    late_minutes = max(0, in_minutes - start)
    early_leave_minutes = max(0, end - out_minutes)

    split = OvertimeSplit(day_minutes=0, night_minutes=0)
    if out_minutes > end:
        overtime_start = max(end, in_minutes)
        split = split_overtime_minutes(overtime_start, out_minutes, active_rules)

    rate = _as_decimal(hourly_rate)
    day_hours = split.day_hours
    night_hours = split.night_hours
    total_hours = split.total_hours
    day_pay = _round_money(day_hours * rate * active_rules.day_multiplier)
    night_pay = _round_money(night_hours * rate * active_rules.night_multiplier)
    total_pay = _round_money(day_pay + night_pay)
    effective_paid_hours = (
        day_hours * active_rules.day_multiplier
        + night_hours * active_rules.night_multiplier
    ).quantize(HOURS_QUANT, rounding=ROUND_HALF_UP)

    return OvertimeResult(
        is_valid=True,
        standard_hours=standard_hours,
        actual_worked_hours=_round_hours(total_worked_minutes),
        total_overtime_hours=total_hours,
        day_overtime_hours=day_hours,
        night_overtime_hours=night_hours,
        day_multiplier=active_rules.day_multiplier,
        night_multiplier=active_rules.night_multiplier,
        effective_paid_hours=effective_paid_hours,
        day_overtime_pay=day_pay,
        night_overtime_pay=night_pay,
        total_overtime_pay=total_pay,
        late_minutes=late_minutes,
        early_leave_minutes=early_leave_minutes,
        explanation=(
            f"إجمالي الإضافي {total_hours} ساعة: "
            f"{day_hours} ساعة نهاري × {active_rules.day_multiplier} + "
            f"{night_hours} ساعة ليلي × {active_rules.night_multiplier}."
        ),
    )
