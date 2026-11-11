"""Permits and missions endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.permit import MissionCreate, MissionOut, PermitCreate, PermitOut
from app.services import permits as service

router = APIRouter(tags=["permits"])


@router.get("/permits", response_model=list[PermitOut])
def list_permits(
    employee_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PermitOut]:
    return [PermitOut.model_validate(row) for row in service.list_permits(db, employee_id=employee_id)]


@router.post("/permits", response_model=PermitOut, status_code=status.HTTP_201_CREATED)
def create_permit(
    payload: PermitCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> PermitOut:
    return PermitOut.model_validate(service.create_permit(db, payload, actor))


@router.get("/missions", response_model=list[MissionOut])
def list_missions(
    employee_id: str | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[MissionOut]:
    return [MissionOut.model_validate(row) for row in service.list_missions(db, employee_id=employee_id)]


@router.post("/missions", response_model=MissionOut, status_code=status.HTTP_201_CREATED)
def create_mission(
    payload: MissionCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> MissionOut:
    return MissionOut.model_validate(service.create_mission(db, payload, actor))
