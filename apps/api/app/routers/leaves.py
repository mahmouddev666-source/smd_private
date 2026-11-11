"""Leave endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.leave import LeaveCreate, LeaveDecision, LeaveOut
from app.services import leaves as service

router = APIRouter(prefix="/leaves", tags=["leaves"])


@router.get("", response_model=Page[LeaveOut])
def list_leaves(
    employee_id: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[LeaveOut]:
    rows, total = service.list_leaves(
        db, employee_id=employee_id, status=status_filter, limit=limit, offset=offset
    )
    return Page(items=[LeaveOut.model_validate(row) for row in rows], total=total, limit=limit, offset=offset)


@router.post("", response_model=LeaveOut, status_code=status.HTTP_201_CREATED)
def create_leave(
    payload: LeaveCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> LeaveOut:
    return LeaveOut.model_validate(service.create_leave(db, payload, actor))


@router.post("/{leave_id}/decision", response_model=LeaveOut)
def decide_leave(
    leave_id: str,
    payload: LeaveDecision,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> LeaveOut:
    return LeaveOut.model_validate(service.decide_leave(db, leave_id, payload.status, actor))
