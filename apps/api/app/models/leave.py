"""Leave balances and leave requests."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class LeaveBalance(IdMixin, TimestampMixin, Base):
    __tablename__ = "leave_balances"
    __table_args__ = (
        UniqueConstraint("employee_id", "year", name="uq_leave_balance_employee_year"),
    )

    employee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True, nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    annual_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("21"))
    annual_used: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("0"))
    casual_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("7"))
    casual_used: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("0"))
    sick_total: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("90"))
    sick_used: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("0"))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Leave(IdMixin, TimestampMixin, Base):
    __tablename__ = "leaves"

    employee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True, nullable=False
    )
    leave_type: Mapped[str] = mapped_column(String(40), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_count: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    reason: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    replacement_employee_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="قيد المراجعة")
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    approval_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
