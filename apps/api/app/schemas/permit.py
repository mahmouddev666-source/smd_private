"""Permits and missions schemas."""

from datetime import date, datetime, time

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class PermitCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)
    permit_type: str = Field(min_length=1, max_length=40)
    date: date
    start_time: time
    end_time: time
    duration_hours: float = Field(gt=0, le=24)
    reason: str = Field(default="", max_length=500)


class PermitOut(PermitCreate, ORMModel):
    id: str
    status: str
    approved_by: str | None
    is_demo: bool
    created_at: datetime


class MissionCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)
    mission_type: str = Field(min_length=1, max_length=40)
    destination: str = Field(min_length=1, max_length=200)
    purpose: str = Field(default="", max_length=500)
    start_date: date
    end_date: date
    days_count: float = Field(gt=0, le=366)
    allowance_per_day: float = Field(default=450, ge=0)
    transportation_type: str = Field(default="سيارة الشركة", max_length=60)


class MissionOut(MissionCreate, ORMModel):
    id: str
    total_allowance: float
    status: str
    approved_by: str | None
    is_demo: bool
    created_at: datetime
