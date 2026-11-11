"""Employee request/response schemas."""

from datetime import date, datetime

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import ORMModel


class EmployeeBase(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)
    name: str = Field(min_length=3, max_length=160)
    national_id: str | None = Field(default=None, max_length=20)
    insurance_id: str | None = Field(default=None, max_length=32)
    mobile: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    department: str = Field(min_length=1, max_length=120)
    current_title: str = Field(default="", max_length=120)
    position: str = Field(default="", max_length=120)
    assigned_title: str = Field(default="", max_length=160)
    contract_type: str = Field(default="دائم", max_length=40)
    grade: str = Field(default="أولى", max_length=40)
    work_location: str = Field(default="مصنع السويس", max_length=160)
    hourly_rate: float = Field(default=90, ge=0, le=100000)
    hire_date: date
    default_shift: str = Field(default="NORMAL_DAY", max_length=24)
    is_active: bool = True


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    employee_id: str | None = Field(default=None, min_length=1, max_length=32)
    name: str | None = Field(default=None, min_length=3, max_length=160)
    national_id: str | None = Field(default=None, max_length=20)
    insurance_id: str | None = Field(default=None, max_length=32)
    mobile: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    department: str | None = Field(default=None, min_length=1, max_length=120)
    current_title: str | None = Field(default=None, max_length=120)
    position: str | None = Field(default=None, max_length=120)
    assigned_title: str | None = Field(default=None, max_length=160)
    contract_type: str | None = Field(default=None, max_length=40)
    grade: str | None = Field(default=None, max_length=40)
    work_location: str | None = Field(default=None, max_length=160)
    hourly_rate: float | None = Field(default=None, ge=0, le=100000)
    hire_date: date | None = None
    default_shift: str | None = Field(default=None, max_length=24)
    is_active: bool | None = None


class EmployeeOut(EmployeeBase, ORMModel):
    id: str
    is_demo: bool
    created_at: datetime
    updated_at: datetime
