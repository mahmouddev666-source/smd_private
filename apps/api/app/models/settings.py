"""Singleton table for approved shift times and overtime rules (T3-19)."""

from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Time,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class WorkSettings(TimestampMixin, Base):
    """One row (`id=1`) holding the whole approved configuration."""

    __tablename__ = "work_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_work_settings_singleton"),
        CheckConstraint("normal_start <> normal_end", name="ck_work_settings_normal_window"),
        CheckConstraint("day_start <> day_end", name="ck_work_settings_day_window"),
        CheckConstraint("night_start <> night_end", name="ck_work_settings_night_window"),
        CheckConstraint(
            "overtime_day_multiplier > 0 AND overtime_day_multiplier <= 5",
            name="ck_work_settings_day_multiplier",
        ),
        CheckConstraint(
            "overtime_night_multiplier > 0 AND overtime_night_multiplier <= 5",
            name="ck_work_settings_night_multiplier",
        ),
        CheckConstraint(
            "late_grace_minutes >= 0 AND late_grace_minutes <= 120",
            name="ck_work_settings_grace",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="Africa/Cairo")
    normal_start: Mapped[time] = mapped_column(Time, nullable=False)
    normal_end: Mapped[time] = mapped_column(Time, nullable=False)
    day_start: Mapped[time] = mapped_column(Time, nullable=False)
    day_end: Mapped[time] = mapped_column(Time, nullable=False)
    night_start: Mapped[time] = mapped_column(Time, nullable=False)
    night_end: Mapped[time] = mapped_column(Time, nullable=False)
    overtime_day_start: Mapped[time] = mapped_column(Time, nullable=False)
    overtime_cutoff: Mapped[time] = mapped_column(Time, nullable=False)
    overtime_day_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    overtime_night_multiplier: Mapped[Decimal] = mapped_column(Numeric(4, 2), nullable=False)
    late_grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
