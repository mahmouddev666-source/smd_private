"""Read/update the singleton work settings and expose safe defaults.

The database row is the source of truth once seeded (T3-19 migration). The
constants below stay as a fallback for fresh test databases and older schemas.
Changing settings only affects future attendance syncs; existing rows are never
recomputed automatically.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.errors import ConflictError, ValidationError
from app.db.base import utcnow
from app.models.settings import WorkSettings
from app.models.user import User
from app.schemas.settings import WorkSettingsOut, WorkSettingsUpdate
from app.services.audit import record_audit

DEFAULT_TIMEZONE = "Africa/Cairo"
DEFAULT_NORMAL_START = time(8, 0)
DEFAULT_NORMAL_END = time(16, 0)
DEFAULT_DAY_START = time(8, 0)
DEFAULT_DAY_END = time(20, 0)
DEFAULT_NIGHT_START = time(20, 0)
DEFAULT_NIGHT_END = time(8, 0)
DEFAULT_OVERTIME_DAY_START = time(6, 0)
DEFAULT_OVERTIME_CUTOFF = time(18, 0)
DEFAULT_DAY_MULTIPLIER = Decimal("1.35")
DEFAULT_NIGHT_MULTIPLIER = Decimal("1.70")
# Matches backend + src/utils/overtimeCalculator.ts; DO NOT change without HR sign-off.
DEFAULT_LATE_GRACE_MINUTES = 15


@dataclass(frozen=True)
class WorkSettingsValues:
    timezone: str = DEFAULT_TIMEZONE
    normal_start: time = DEFAULT_NORMAL_START
    normal_end: time = DEFAULT_NORMAL_END
    day_start: time = DEFAULT_DAY_START
    day_end: time = DEFAULT_DAY_END
    night_start: time = DEFAULT_NIGHT_START
    night_end: time = DEFAULT_NIGHT_END
    overtime_day_start: time = DEFAULT_OVERTIME_DAY_START
    overtime_cutoff: time = DEFAULT_OVERTIME_CUTOFF
    overtime_day_multiplier: Decimal = DEFAULT_DAY_MULTIPLIER
    overtime_night_multiplier: Decimal = DEFAULT_NIGHT_MULTIPLIER
    late_grace_minutes: int = DEFAULT_LATE_GRACE_MINUTES
    version: int = 1
    updated_by: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def shift_windows(self) -> dict[str, tuple[int, int, bool]]:
        """Shift name -> (start minutes, end minutes, crosses midnight)."""
        return {
            "NORMAL_DAY": _window(self.normal_start, self.normal_end),
            "DAY_SHIFT": _window(self.day_start, self.day_end),
            "NIGHT_SHIFT": _window(self.night_start, self.night_end, True),
        }


def _window(start: time, end: time, crosses_midnight: bool = False) -> tuple[int, int, bool]:
    start_minutes = start.hour * 60 + start.minute
    end_minutes = end.hour * 60 + end.minute
    if crosses_midnight and end_minutes <= start_minutes:
        end_minutes += 24 * 60
    return start_minutes, end_minutes, crosses_midnight


def _default_values() -> WorkSettingsValues:
    now = utcnow()
    return WorkSettingsValues(created_at=now, updated_at=now)


def _values_from_row(row: WorkSettings) -> WorkSettingsValues:
    return WorkSettingsValues(
        timezone=row.timezone,
        normal_start=row.normal_start,
        normal_end=row.normal_end,
        day_start=row.day_start,
        day_end=row.day_end,
        night_start=row.night_start,
        night_end=row.night_end,
        overtime_day_start=row.overtime_day_start,
        overtime_cutoff=row.overtime_cutoff,
        overtime_day_multiplier=row.overtime_day_multiplier,
        overtime_night_multiplier=row.overtime_night_multiplier,
        late_grace_minutes=row.late_grace_minutes,
        version=row.version,
        updated_by=row.updated_by,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def get_work_settings(db: Session) -> WorkSettingsValues:
    """Return the settings row or the approved defaults without writing."""
    row = db.get(WorkSettings, 1)
    return _values_from_row(row) if row is not None else _default_values()


def _hhmm(value: time) -> time:
    return time(value.hour, value.minute)


def _public_dict(values: WorkSettingsValues) -> dict[str, object]:
    return {
        "timezone": values.timezone,
        "normal_start": values.normal_start.strftime("%H:%M"),
        "normal_end": values.normal_end.strftime("%H:%M"),
        "day_start": values.day_start.strftime("%H:%M"),
        "day_end": values.day_end.strftime("%H:%M"),
        "night_start": values.night_start.strftime("%H:%M"),
        "night_end": values.night_end.strftime("%H:%M"),
        "overtime_day_start": values.overtime_day_start.strftime("%H:%M"),
        "overtime_cutoff": values.overtime_cutoff.strftime("%H:%M"),
        "overtime_day_multiplier": float(values.overtime_day_multiplier),
        "overtime_night_multiplier": float(values.overtime_night_multiplier),
        "late_grace_minutes": values.late_grace_minutes,
        "version": values.version,
    }


def _validate_windows(values: WorkSettingsValues) -> None:
    for name, start, end in (
        ("normal", values.normal_start, values.normal_end),
        ("day", values.day_start, values.day_end),
        ("night", values.night_start, values.night_end),
    ):
        if start == end:
            raise ValidationError(f"بداية ونهاية الوردية {name} يجب أن تختلفا.", code="VALIDATION_ERROR")


def to_out(values: WorkSettingsValues) -> WorkSettingsOut:
    return WorkSettingsOut(
        id=1,
        timezone=values.timezone,
        normal_start=values.normal_start.strftime("%H:%M"),
        normal_end=values.normal_end.strftime("%H:%M"),
        day_start=values.day_start.strftime("%H:%M"),
        day_end=values.day_end.strftime("%H:%M"),
        night_start=values.night_start.strftime("%H:%M"),
        night_end=values.night_end.strftime("%H:%M"),
        overtime_day_start=values.overtime_day_start.strftime("%H:%M"),
        overtime_cutoff=values.overtime_cutoff.strftime("%H:%M"),
        overtime_day_multiplier=float(values.overtime_day_multiplier),
        overtime_night_multiplier=float(values.overtime_night_multiplier),
        late_grace_minutes=values.late_grace_minutes,
        version=values.version,
        updated_by=values.updated_by,
        created_at=values.created_at or utcnow(),
        updated_at=values.updated_at or utcnow(),
    )


def update_work_settings(
    db: Session, patch: WorkSettingsUpdate, actor: User
) -> WorkSettingsValues:
    """Patch supplied fields, bump version and write one audit row."""
    row = db.get(WorkSettings, 1)
    current = _values_from_row(row) if row is not None else _default_values()

    if patch.expected_version is not None and patch.expected_version != current.version:
        raise ConflictError(
            f"تم تعديل الإعدادات بواسطة مستخدم آخر (الإصدار الحالي {current.version}).",
            code="SETTINGS_VERSION_CONFLICT",
        )

    changes = patch.model_dump(exclude_unset=True, exclude={"expected_version"})
    normalized: dict[str, object] = {}
    for key, value in changes.items():
        if value is None:
            continue
        if isinstance(value, time):
            normalized[key] = _hhmm(value)
        elif key in {"overtime_day_multiplier", "overtime_night_multiplier"}:
            normalized[key] = Decimal(str(value)).quantize(Decimal("0.01"))
        elif key == "timezone":
            normalized[key] = value.strip()
        else:
            normalized[key] = value

    updated = replace(current, **normalized)
    _validate_windows(updated)

    before = _public_dict(current)
    after = _public_dict(updated)
    after["version"] = current.version + 1

    if row is None:
        # Fresh test database without the seed row: materialise all columns.
        row = WorkSettings(id=1)
        db.add(row)
        for field in (
            "timezone",
            "normal_start",
            "normal_end",
            "day_start",
            "day_end",
            "night_start",
            "night_end",
            "overtime_day_start",
            "overtime_cutoff",
            "overtime_day_multiplier",
            "overtime_night_multiplier",
            "late_grace_minutes",
        ):
            setattr(row, field, getattr(updated, field))
    else:
        for field, value in normalized.items():
            setattr(row, field, value)
    row.version = current.version + 1
    row.updated_by = actor.id
    db.flush()

    record_audit(
        db,
        actor=actor,
        action="settings.work.update",
        entity="settings",
        entity_id="work",
        before=before,
        after=after,
    )
    db.commit()
    db.refresh(row)
    return _values_from_row(row)
