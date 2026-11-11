"""Attendance schemas."""

from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class AttendanceBase(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)
    date: date
    check_in: time | None = None
    check_out: time | None = None
    status: str = Field(default="حاضر", max_length=40)
    overtime_minutes: int = Field(default=0, ge=0)
    late_minutes: int = Field(default=0, ge=0)
    early_leave_minutes: int = Field(default=0, ge=0)
    notes: str = Field(default="", max_length=500)


class AttendanceUpsert(AttendanceBase):
    pass


class AttendanceOut(AttendanceBase, ORMModel):
    id: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime
