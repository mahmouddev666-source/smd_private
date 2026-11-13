"""ZKTeco device endpoints: configuration, connection test, sync and logs.

The connection is always opened by the API on the LAN; the browser only calls
these endpoints. Raw punches are stored once (`UNIQUE(device_id, enroll_number,
punch_time)`) and every run is recorded in `zkteco_sync_logs`. Known punches are
mapped to daily attendance by `services/attendance_processor.py`; unknown PINs
stay in the report until HR assigns or ignores them.
"""

from datetime import timedelta

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.base import utcnow
from app.db.session import get_db
from app.models.device import BiometricPunch, ZktecoDevice, ZktecoSyncLog
from app.models.employee import Employee
from app.models.user import User
from app.schemas.device import (
    ConnectionOut,
    DeviceIn,
    DeviceOut,
    PunchAssign,
    PunchOut,
    PunchResolutionOut,
    SyncLogOut,
    UnknownPunchOut,
)
from app.services import attendance_processor
from app.services import zkteco as connector
from app.services.attendance_processor import ProcessingStats
from app.services.audit import record_audit
from app.utils.ids import new_id

router = APIRouter(prefix="/devices", tags=["devices"])


def _get_device(db: Session, device_id: str) -> ZktecoDevice:
    device = db.get(ZktecoDevice, device_id)
    if device is None:
        raise NotFoundError("الجهاز غير موجود.", code="DEVICE_NOT_FOUND")
    return device


# ---------------------------------------------------------------------------
# Reads (declared before the parameterised routes)
# ---------------------------------------------------------------------------


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    rows = db.scalars(select(ZktecoDevice).order_by(ZktecoDevice.name)).all()
    return [DeviceOut.from_row(row) for row in rows]


@router.get("/punches", response_model=list[PunchOut])
def list_punches(
    device_id: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PunchOut]:
    query = select(BiometricPunch).order_by(BiometricPunch.punch_time.desc()).limit(limit)
    if device_id:
        query = query.where(BiometricPunch.device_id == device_id)
    return [PunchOut.from_row(row) for row in db.scalars(query).all()]


@router.get("/sync-logs", response_model=list[SyncLogOut])
def list_sync_logs(
    device_id: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SyncLogOut]:
    query = select(ZktecoSyncLog).order_by(ZktecoSyncLog.started_at.desc()).limit(limit)
    if device_id:
        query = query.where(ZktecoSyncLog.device_id == device_id)
    return [SyncLogOut.from_row(row) for row in db.scalars(query).all()]


@router.get("/unknown-punches", response_model=list[UnknownPunchOut])
def list_unknown_punches(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[UnknownPunchOut]:
    """Punches whose PIN matches no employee and was not ignored yet."""
    known_ids = select(Employee.employee_id)
    rows = db.execute(
        select(BiometricPunch, ZktecoDevice.name)
        .join(ZktecoDevice, ZktecoDevice.id == BiometricPunch.device_id)
        .where(
            BiometricPunch.ignored_at.is_(None),
            BiometricPunch.resolved_employee_id.is_(None),
            BiometricPunch.enroll_number.not_in(known_ids),
        )
        .order_by(BiometricPunch.punch_time.desc())
        .limit(limit)
    ).all()
    return [UnknownPunchOut.from_row_with_device(punch, name) for punch, name in rows]


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> DeviceOut:
    data = payload.model_dump()
    device = ZktecoDevice(
        id=new_id(), status="disconnected", is_demo=False, **data
    )
    db.add(device)
    record_audit(
        db, actor=actor, action="create", entity="device", entity_id=device.id,
        after={"name": device.name, "ip": device.ip_address, "has_key": bool(device.comm_key)},
    )
    db.commit()
    db.refresh(device)
    return DeviceOut.from_row(device)


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: str,
    payload: DeviceIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> DeviceOut:
    device = _get_device(db, device_id)
    data = payload.model_dump()
    # An empty key means "keep the stored one" so the UI never has to echo it.
    comm_key = data.pop("comm_key", "")
    for field, value in data.items():
        setattr(device, field, value)
    if comm_key:
        device.comm_key = comm_key
    record_audit(
        db, actor=actor, action="update", entity="device", entity_id=device.id,
        after={"name": device.name, "ip": device.ip_address},
    )
    db.commit()
    db.refresh(device)
    return DeviceOut.from_row(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> None:
    device = _get_device(db, device_id)
    # Remove dependent rows explicitly: SQLite does not enforce ON DELETE CASCADE.
    db.execute(delete(BiometricPunch).where(BiometricPunch.device_id == device.id))
    db.execute(delete(ZktecoSyncLog).where(ZktecoSyncLog.device_id == device.id))
    record_audit(db, actor=actor, action="delete", entity="device", entity_id=device.id)
    db.delete(device)
    db.commit()


# ---------------------------------------------------------------------------
# Hardware operations
# ---------------------------------------------------------------------------


@router.post("/{device_id}/test-connection", response_model=ConnectionOut)
def test_connection(
    device_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
    factory: connector.ConnectorFactory = Depends(connector.get_connector_factory),
) -> ConnectionOut:
    device = _get_device(db, device_id)
    info, _ = connector.test_device(db, device, actor, factory)
    return ConnectionOut(
        serial_number=info.serial_number,
        firmware_version=info.firmware_version,
        device_name=info.device_name,
        user_count=info.user_count,
        log_count=info.log_count,
        message=(
            f"تم الاتصال بنجاح بجهاز {device.name}. "
            f"المستخدمون: {info.user_count} — الحركات: {info.log_count}."
        ),
    )


@router.post("/{device_id}/sync", response_model=SyncLogOut)
def sync_device(
    device_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
    factory: connector.ConnectorFactory = Depends(connector.get_connector_factory),
) -> SyncLogOut:
    device = _get_device(db, device_id)
    log = connector.sync_device(db, device, actor, factory)
    return SyncLogOut.from_row(log)


# ---------------------------------------------------------------------------
# Unknown biometrics report
# ---------------------------------------------------------------------------


def _get_punch(db: Session, punch_id: str) -> BiometricPunch:
    punch = db.get(BiometricPunch, punch_id)
    if punch is None:
        raise NotFoundError("حركة البصمة غير موجودة.", code="PUNCH_NOT_FOUND")
    return punch


@router.post("/punches/{punch_id}/assign", response_model=PunchResolutionOut)
def assign_unknown_punch(
    punch_id: str,
    payload: PunchAssign,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> PunchResolutionOut:
    """Link an unknown PIN to a real employee and map it to attendance."""
    punch = _get_punch(db, punch_id)
    employee = db.scalar(select(Employee).where(Employee.employee_id == payload.employee_id))
    if employee is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")

    punch.resolved_employee_id = employee.employee_id
    punch.ignored_at = None
    record_audit(
        db,
        actor=actor,
        action="assign",
        entity="biometric_punch",
        entity_id=punch.id,
        before={"enroll_number": punch.enroll_number},
        after={"employee_id": employee.employee_id},
    )
    db.commit()

    stats = ProcessingStats()
    device = db.get(ZktecoDevice, punch.device_id)
    if device is not None:
        stats = attendance_processor.process_device_punches(
            db,
            device,
            actor,
            since=punch.punch_time - timedelta(days=2),
        )

    return PunchResolutionOut(
        punch=PunchOut.from_row(punch),
        attendance_created=stats.created > 0,
        attendance_updated=stats.updated > 0,
        message=(
            f"تم ربط البصمة بالموظف {employee.name} ({employee.employee_id}) "
            "وتحديث سجل الحضور."
        ),
    )


@router.post("/punches/{punch_id}/ignore", response_model=PunchResolutionOut)
def ignore_unknown_punch(
    punch_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> PunchResolutionOut:
    """Dismiss an unknown punch so it leaves the report without touching data."""
    punch = _get_punch(db, punch_id)
    punch.ignored_at = utcnow()
    record_audit(
        db,
        actor=actor,
        action="ignore",
        entity="biometric_punch",
        entity_id=punch.id,
        before={"enroll_number": punch.enroll_number},
    )
    db.commit()
    db.refresh(punch)
    return PunchResolutionOut(
        punch=PunchOut.from_row(punch),
        attendance_created=False,
        attendance_updated=False,
        message="تم تجاهل البصمة ولن تظهر في تقرير البصمات غير المعروفة.",
    )
