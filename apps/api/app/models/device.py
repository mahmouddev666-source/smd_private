"""ZKTeco biometric terminals, sync logs and raw punches."""

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
    # Communication key is write-only for the API: it is stored but never returned.
    comm_key: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    location: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="disconnected")
    serial_number: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    firmware_version: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    total_users: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_logs: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
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


class ZktecoSyncLog(IdMixin, TimestampMixin, Base):
    """One row per manual or scheduled connector run (time, counts, errors)."""

    __tablename__ = "zkteco_sync_logs"

    device_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("zkteco_devices.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fetched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    inserted_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duplicate_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    unknown_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    triggered_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
