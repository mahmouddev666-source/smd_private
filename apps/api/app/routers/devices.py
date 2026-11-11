"""ZKTeco device management endpoints (configuration only in phase 2)."""

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.device import ZktecoDevice
from app.models.user import User
from app.schemas.common import ORMModel
from app.services.audit import record_audit
from app.utils.ids import new_id

router = APIRouter(prefix="/devices", tags=["devices"])


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    ip_address: str = Field(min_length=3, max_length=64)
    port: int = Field(default=4370, ge=1, le=65535)
    location: str = Field(default="", max_length=160)
    model: str = Field(default="", max_length=80)


class DeviceOut(DeviceIn, ORMModel):
    id: str
    status: str
    is_demo: bool


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[DeviceOut]:
    rows = db.scalars(select(ZktecoDevice).order_by(ZktecoDevice.name)).all()
    return [DeviceOut.model_validate(row) for row in rows]


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_device(
    payload: DeviceIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> DeviceOut:
    device = ZktecoDevice(id=new_id(), status="disconnected", is_demo=False, **payload.model_dump())
    db.add(device)
    record_audit(
        db, actor=actor, action="create", entity="device", entity_id=device.id,
        after={"name": device.name, "ip": device.ip_address},
    )
    db.commit()
    db.refresh(device)
    return DeviceOut.model_validate(device)


@router.patch("/{device_id}", response_model=DeviceOut)
def update_device(
    device_id: str,
    payload: DeviceIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> DeviceOut:
    device = db.get(ZktecoDevice, device_id)
    if device is None:
        raise NotFoundError("الجهاز غير موجود.", code="DEVICE_NOT_FOUND")
    for field, value in payload.model_dump().items():
        setattr(device, field, value)
    record_audit(db, actor=actor, action="update", entity="device", entity_id=device.id)
    db.commit()
    db.refresh(device)
    return DeviceOut.model_validate(device)


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_device(
    device_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> None:
    device = db.get(ZktecoDevice, device_id)
    if device is None:
        raise NotFoundError("الجهاز غير موجود.", code="DEVICE_NOT_FOUND")
    record_audit(db, actor=actor, action="delete", entity="device", entity_id=device.id)
    db.delete(device)
    db.commit()
