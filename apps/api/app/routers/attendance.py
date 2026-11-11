"""Attendance endpoints."""

from datetime import date

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.attendance import AttendanceOut, AttendanceUpsert
from app.schemas.common import Page
from app.services import attendance as service

router = APIRouter(prefix="/attendance", tags=["attendance"])


class AttendanceUpsertResult(BaseModel):
    record: AttendanceOut
    created: bool


@router.get("", response_model=Page[AttendanceOut])
def list_attendance(
    employee_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[AttendanceOut]:
    rows, total = service.list_attendance(
        db, employee_id=employee_id, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )
    return Page(items=[AttendanceOut.model_validate(row) for row in rows], total=total, limit=limit, offset=offset)


@router.post("", response_model=AttendanceUpsertResult, status_code=status.HTTP_200_OK)
def upsert_attendance(
    payload: AttendanceUpsert,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> AttendanceUpsertResult:
    record, created = service.upsert_attendance(db, payload, actor)
    return AttendanceUpsertResult(record=AttendanceOut.model_validate(record), created=created)


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attendance(
    record_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> None:
    service.delete_attendance(db, record_id, actor)
