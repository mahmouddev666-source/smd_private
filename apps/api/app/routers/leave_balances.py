"""Leave balance read endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.leave import LeaveBalanceOut
from app.services import leaves as service

router = APIRouter(prefix="/leave-balances", tags=["leaves"])


@router.get("", response_model=list[LeaveBalanceOut])
def list_balances(
    employee_id: str | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[LeaveBalanceOut]:
    rows = service.list_balances(db, employee_id=employee_id, year=year)
    return [LeaveBalanceOut.model_validate(row) for row in rows]
