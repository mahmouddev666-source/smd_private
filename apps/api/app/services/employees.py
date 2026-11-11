"""Employee business rules (validation, uniqueness, audit)."""

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.services.audit import record_audit
from app.utils.ids import new_id


def _ensure_unique(db: Session, *, employee_id: str, national_id: str | None, exclude: str | None = None) -> None:
    stmt = select(Employee).where(Employee.employee_id == employee_id)
    if exclude:
        stmt = stmt.where(Employee.id != exclude)
    if db.scalar(stmt):
        raise ConflictError("كود الموظف مستخدم بالفعل.", code="EMPLOYEE_CODE_EXISTS")

    if national_id:
        stmt = select(Employee).where(Employee.national_id == national_id)
        if exclude:
            stmt = stmt.where(Employee.id != exclude)
        if db.scalar(stmt):
            raise ConflictError("الرقم القومي مسجل لموظف آخر.", code="NATIONAL_ID_EXISTS")


def list_employees(
    db: Session,
    *,
    search: str | None = None,
    department: str | None = None,
    is_active: bool | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Employee], int]:
    stmt = select(Employee)
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Employee.name.ilike(like),
                Employee.employee_id.ilike(like),
                Employee.national_id.ilike(like),
            )
        )
    if department and department != "ALL":
        stmt = stmt.where(Employee.department == department)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)

    total = len(db.scalars(stmt).all())
    rows = db.scalars(stmt.order_by(Employee.employee_id).limit(limit).offset(offset)).all()
    return list(rows), total


def get_employee(db: Session, employee_id: str) -> Employee:
    employee = db.scalar(select(Employee).where(Employee.employee_id == employee_id))
    if employee is None:
        employee = db.get(Employee, employee_id)
    if employee is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")
    return employee


def create_employee(db: Session, payload: EmployeeCreate, actor: User) -> Employee:
    _ensure_unique(db, employee_id=payload.employee_id, national_id=payload.national_id)
    data = payload.model_dump()
    employee = Employee(id=new_id(), is_demo=payload.employee_id.startswith("90"), **data)
    db.add(employee)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="employee",
        entity_id=employee.employee_id,
        after=_snapshot(employee),
    )
    db.commit()
    db.refresh(employee)
    return employee


def update_employee(db: Session, employee_id: str, payload: EmployeeUpdate, actor: User) -> Employee:
    employee = get_employee(db, employee_id)
    before = _snapshot(employee)
    changes: dict[str, Any] = payload.model_dump(exclude_unset=True)

    if "employee_id" in changes and changes["employee_id"] != employee.employee_id:
        _ensure_unique(
            db,
            employee_id=changes["employee_id"],
            national_id=changes.get("national_id", employee.national_id),
            exclude=employee.id,
        )
    elif "national_id" in changes:
        _ensure_unique(
            db,
            employee_id=employee.employee_id,
            national_id=changes["national_id"],
            exclude=employee.id,
        )

    for field, value in changes.items():
        setattr(employee, field, value)

    record_audit(
        db,
        actor=actor,
        action="update",
        entity="employee",
        entity_id=employee.employee_id,
        before=before,
        after=_snapshot(employee),
    )
    db.commit()
    db.refresh(employee)
    return employee


def deactivate_employee(db: Session, employee_id: str, actor: User) -> Employee:
    """Soft delete: employees with financial records are never hard-deleted."""
    employee = get_employee(db, employee_id)
    before = _snapshot(employee)
    employee.is_active = False
    record_audit(
        db,
        actor=actor,
        action="deactivate",
        entity="employee",
        entity_id=employee.employee_id,
        before=before,
        after=_snapshot(employee),
    )
    db.commit()
    db.refresh(employee)
    return employee


def _snapshot(employee: Employee) -> dict[str, Any]:
    return {
        "employee_id": employee.employee_id,
        "name": employee.name,
        "department": employee.department,
        "is_active": employee.is_active,
    }
