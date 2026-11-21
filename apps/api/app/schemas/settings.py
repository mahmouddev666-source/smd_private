"""Pydantic contracts for `GET/PATCH /api/settings/work`."""

from datetime import datetime, time

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel


class WorkSettingsUpdate(BaseModel):
    """All fields optional; only supplied fields are changed."""

    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    normal_start: time | None = None
    normal_end: time | None = None
    day_start: time | None = None
    day_end: time | None = None
    night_start: time | None = None
    night_end: time | None = None
    overtime_day_start: time | None = None
    overtime_cutoff: time | None = None
    overtime_day_multiplier: float | None = Field(default=None, gt=0, le=5)
    overtime_night_multiplier: float | None = Field(default=None, gt=0, le=5)
    late_grace_minutes: int | None = Field(default=None, ge=0, le=120)
    expected_version: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _different_shift_boundaries(self) -> "WorkSettingsUpdate":
        for start_name, end_name in (
            ("normal_start", "normal_end"),
            ("day_start", "day_end"),
            ("night_start", "night_end"),
        ):
            start, end = getattr(self, start_name), getattr(self, end_name)
            if start is not None and end is not None and start == end:
                raise ValueError(f"{start_name} must differ from {end_name}")
        return self


class WorkSettingsOut(ORMModel):
    id: int
    timezone: str
    normal_start: str
    normal_end: str
    day_start: str
    day_end: str
    night_start: str
    night_end: str
    overtime_day_start: str
    overtime_cutoff: str
    overtime_day_multiplier: float
    overtime_night_multiplier: float
    late_grace_minutes: int
    version: int
    updated_by: str | None
    created_at: datetime
    updated_at: datetime
