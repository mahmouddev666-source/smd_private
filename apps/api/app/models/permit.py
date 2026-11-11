"""Exit permits and official missions."""

from datetime import date, time
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class Permit(IdMixin, TimestampMixin, Base):
    __tablename__ = "permits"

    employee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True, nullable=False
    )
    permit_type: Mapped[str] = mapped_column(String(40), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    duration_hours: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=Decimal("2"))
    reason: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="معتمد")
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Mission(IdMixin, TimestampMixin, Base):
    __tablename__ = "missions"

    employee_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("employees.employee_id", ondelete="CASCADE"), index=True, nullable=False
    )
    mission_type: Mapped[str] = mapped_column(String(40), nullable=False)
    destination: Mapped[str] = mapped_column(String(200), nullable=False)
    purpose: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days_count: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False, default=Decimal("1"))
    allowance_per_day: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("450"))
    total_allowance: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    transportation_type: Mapped[str] = mapped_column(String(60), nullable=False, default="سيارة الشركة")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="معتمد")
    approved_by: Mapped[str | None] = mapped_column(String(160), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
