"""ZKTeco device endpoints: configuration, connection test, sync and logs.

The connection is always opened by the API on the LAN; the browser only calls
these endpoints. Raw punches are stored once (`UNIQUE(device_id, enroll_number,
punch_time)`) and every run is recorded in `zkteco_sync_logs`.
"""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.device import BiometricPunch, ZktecoDevice, ZktecoSyncLog
from app.models.user import User
from app.schemas.device import (
    ConnectionOut,
    DeviceIn,
    DeviceOut,
    PunchOut,
    SyncLogOut,
)
from app.services import zkteco as connector
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
