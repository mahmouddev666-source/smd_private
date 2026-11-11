"""Employee master data."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class Employee(IdMixin, TimestampMixin, Base):
    __tablename__ = "employees"

    employee_id: Mapped[str] = mapped_column(String(32), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    national_id: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    insurance_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    mobile: Mapped[str | None] = mapped_column(String(32), nullable=True)
    email: Mapped[str | None] = mapped_column(String(160), nullable=True)

    department: Mapped[str] = mapped_column(String(120), nullable=False)
    current_title: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    position: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    assigned_title: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    contract_type: Mapped[str] = mapped_column(String(40), nullable=False, default="دائم")
    grade: Mapped[str] = mapped_column(String(40), nullable=False, default="أولى")
    work_location: Mapped[str] = mapped_column(String(160), nullable=False, default="مصنع السويس")

    hourly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, default=Decimal("90.00"))
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    default_shift: Mapped[str] = mapped_column(String(24), nullable=False, default="NORMAL_DAY")

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
