"""ZKTeco biometric terminals and raw punches."""

from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class ZktecoDevice(IdMixin, TimestampMixin, Base):
    __tablename__ = "zkteco_devices"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    ip_address: Mapped[str] = mapped_column(String(64), nullable=False)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=4370)
    location: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="disconnected")
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class BiometricPunch(IdMixin, TimestampMixin, Base):
    __tablename__ = "biometric_punches"
    __table_args__ = (
        UniqueConstraint(
            "device_id", "enroll_number", "punch_time", name="uq_punch_device_enroll_time"
        ),
    )

    device_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("zkteco_devices.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    enroll_number: Mapped[str] = mapped_column(String(32), nullable=False)
    punch_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    punch_type: Mapped[str] = mapped_column(String(20), nullable=False, default="دخول")
    verify_mode: Mapped[str] = mapped_column(String(40), nullable=False, default="بصمة")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
