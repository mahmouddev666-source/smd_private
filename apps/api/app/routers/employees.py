"""Employee CRUD endpoints."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.employee import EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.services import employees as service

router = APIRouter(prefix="/employees", tags=["employees"])


@router.get("", response_model=Page[EmployeeOut])
def list_employees(
    search: str | None = None,
    department: str | None = None,
    is_active: bool | None = None,
    limit: int = Query(default=50, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[EmployeeOut]:
    rows, total = service.list_employees(
        db, search=search, department=department, is_active=is_active, limit=limit, offset=offset
    )
    return Page(items=[EmployeeOut.model_validate(row) for row in rows], total=total, limit=limit, offset=offset)


@router.get("/{employee_id}", response_model=EmployeeOut)
def get_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> EmployeeOut:
    return EmployeeOut.model_validate(service.get_employee(db, employee_id))


@router.post("", response_model=EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> EmployeeOut:
    return EmployeeOut.model_validate(service.create_employee(db, payload, actor))


@router.patch("/{employee_id}", response_model=EmployeeOut)
def update_employee(
    employee_id: str,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> EmployeeOut:
    return EmployeeOut.model_validate(service.update_employee(db, employee_id, payload, actor))


@router.delete("/{employee_id}", response_model=EmployeeOut)
def delete_employee(
    employee_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> EmployeeOut:
    """Soft delete (deactivate) so financial history is preserved."""
    return EmployeeOut.model_validate(service.deactivate_employee(db, employee_id, actor))
