"""Daily attendance records (one row per employee per day)."""

from datetime import date, time

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class Attendance(IdMixin, TimestampMixin, Base):
    __tablename__ = "attendance"
    __table_args__ = (
        UniqueConstraint("employee_id", "date", name="uq_attendance_employee_date"),
    )

    employee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True, nullable=False
    )
    date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    check_in: Mapped[time | None] = mapped_column(Time, nullable=True)
    check_out: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="حاضر")
    overtime_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    early_leave_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    notes: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
