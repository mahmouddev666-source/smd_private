"""ZKTeco device, connection, sync-log and punch schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.models.device import BiometricPunch, ZktecoDevice, ZktecoSyncLog
from app.schemas.common import ORMModel


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ip_address: str = Field(min_length=3, max_length=64)
    port: int = Field(default=4370, ge=1, le=65535)
    # Write-only: accepted on create/update, never serialised back.
    comm_key: str = Field(default="", max_length=32)
    location: str = Field(default="", max_length=160)
    model: str = Field(default="", max_length=80)


class DeviceOut(ORMModel):
    id: str
    name: str
    ip_address: str
    port: int
    location: str
    model: str
    status: str
    serial_number: str
    firmware_version: str
    total_users: int
    total_logs: int
    last_sync_at: datetime | None
    has_comm_key: bool
    is_demo: bool

    @classmethod
    def from_row(cls, device: ZktecoDevice) -> "DeviceOut":
        return cls(
            id=device.id,
            name=device.name,
            ip_address=device.ip_address,
            port=device.port,
            location=device.location,
            model=device.model,
            status=device.status,
            serial_number=device.serial_number,
            firmware_version=device.firmware_version,
            total_users=device.total_users,
            total_logs=device.total_logs,
            last_sync_at=device.last_sync_at,
            has_comm_key=bool(device.comm_key),
            is_demo=device.is_demo,
        )


class ConnectionOut(BaseModel):
    status: str = "connected"
    serial_number: str
    firmware_version: str
    device_name: str
    user_count: int
    log_count: int
    message: str


class SyncLogOut(ORMModel):
    id: str
    device_id: str
    status: str
    started_at: datetime
    finished_at: datetime | None
    fetched_count: int
    inserted_count: int
    duplicate_count: int
    unknown_count: int
    attendance_created: int
    attendance_updated: int
    error_message: str

    @classmethod
    def from_row(cls, log: ZktecoSyncLog) -> "SyncLogOut":
        return cls(
            id=log.id,
            device_id=log.device_id,
            status=log.status,
            started_at=log.started_at,
            finished_at=log.finished_at,
            fetched_count=log.fetched_count,
            inserted_count=log.inserted_count,
            duplicate_count=log.duplicate_count,
            unknown_count=log.unknown_count,
            attendance_created=log.attendance_created,
            attendance_updated=log.attendance_updated,
            error_message=log.error_message,
        )


class PunchOut(ORMModel):
    id: str
    device_id: str
    enroll_number: str
    punch_time: datetime
    punch_type: str
    verify_mode: str
    resolved_employee_id: str | None
    is_ignored: bool
    is_demo: bool

    @classmethod
    def from_row(cls, punch: BiometricPunch) -> "PunchOut":
        return cls(
            id=punch.id,
            device_id=punch.device_id,
            enroll_number=punch.enroll_number,
            punch_time=punch.punch_time,
            punch_type=punch.punch_type,
            verify_mode=punch.verify_mode,
            resolved_employee_id=punch.resolved_employee_id,
            is_ignored=punch.ignored_at is not None,
            is_demo=punch.is_demo,
        )


class UnknownPunchOut(PunchOut):
    """A punch whose PIN is not linked to any employee yet."""

    device_name: str

    @classmethod
    def from_row_with_device(cls, punch: BiometricPunch, device_name: str) -> "UnknownPunchOut":
        base = PunchOut.from_row(punch)
        return cls(**base.model_dump(), device_name=device_name)


class PunchAssign(BaseModel):
    employee_id: str = Field(min_length=1, max_length=32)


class PunchResolutionOut(BaseModel):
    punch: PunchOut
    attendance_created: bool
    attendance_updated: bool
    message: str
