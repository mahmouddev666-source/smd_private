"""Leave request/response schemas."""

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel


class LeaveCreate(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)
    leave_type: str = Field(min_length=1, max_length=40)
    start_date: date
    end_date: date
    days_count: float = Field(gt=0, le=366)
    reason: str = Field(default="", max_length=500)
    replacement_employee_id: str | None = None
    notes: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_dates(self) -> "LeaveCreate":
        if self.end_date < self.start_date:
            raise ValueError("تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء.")
        return self


class LeaveDecision(BaseModel):
    status: str = Field(pattern="^(معتمد|مرفوض)$")


class LeaveOut(ORMModel):
    id: str
    employee_id: str
    leave_type: str
    start_date: date
    end_date: date
    days_count: float
    reason: str
    replacement_employee_id: str | None
    status: str
    approved_by: str | None
    approval_date: date | None
    notes: str
    is_demo: bool
    created_at: datetime
