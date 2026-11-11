"""Leave business rules: balance check, overlap guard, single deduction."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.employee import Employee
from app.models.leave import Leave, LeaveBalance
from app.models.user import User
from app.schemas.leave import LeaveCreate
from app.services.audit import record_audit
from app.utils.ids import new_id

BALANCE_FIELDS = {
    "اعتيادي": ("annual_used", "annual_total"),
    "عارضة": ("casual_used", "casual_total"),
    "مرضي": ("sick_used", "sick_total"),
}

DEFAULT_BALANCE = {
    "annual_total": Decimal("21"),
    "casual_total": Decimal("7"),
    "sick_total": Decimal("90"),
}


def _ensure_employee(db: Session, employee_id: str) -> Employee:
    employee = db.scalar(select(Employee).where(Employee.employee_id == employee_id))
    if employee is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")
    return employee


def _get_or_create_balance(db: Session, employee_id: str, year: int) -> LeaveBalance:
    balance = db.scalar(
        select(LeaveBalance).where(
            LeaveBalance.employee_id == employee_id, LeaveBalance.year == year
        )
    )
    if balance is None:
        balance = LeaveBalance(id=new_id(), employee_id=employee_id, year=year, **DEFAULT_BALANCE)
        db.add(balance)
        db.flush()
    return balance


def list_leaves(
    db: Session,
    *,
    employee_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Leave], int]:
    stmt = select(Leave)
    if employee_id:
        stmt = stmt.where(Leave.employee_id == employee_id)
    if status:
        stmt = stmt.where(Leave.status == status)
    total = len(db.scalars(stmt).all())
    rows = db.scalars(stmt.order_by(Leave.start_date.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def create_leave(db: Session, payload: LeaveCreate, actor: User) -> Leave:
    _ensure_employee(db, payload.employee_id)

    overlap = db.scalar(
        select(Leave).where(
            Leave.employee_id == payload.employee_id,
            Leave.status != "مرفوض",
            Leave.start_date <= payload.end_date,
            Leave.end_date >= payload.start_date,
        )
    )
    if overlap is not None:
        raise ConflictError(
            "يوجد طلب إجازة آخر لنفس الموظف في نفس الفترة.", code="LEAVE_OVERLAP"
        )

    leave = Leave(
        id=new_id(),
        is_demo=False,
        status="قيد المراجعة",
        **payload.model_dump(),
    )
    if leave.leave_type in BALANCE_FIELDS:
        balance = _get_or_create_balance(db, leave.employee_id, leave.start_date.year)
        used_field, total_field = BALANCE_FIELDS[leave.leave_type]
        remaining = getattr(balance, total_field) - getattr(balance, used_field)
        if Decimal(str(payload.days_count)) > remaining:
            raise ValidationError(
                f"الرصيد المتاح لهذا النوع {remaining} يوم فقط.", code="LEAVE_BALANCE_EXCEEDED"
            )

    db.add(leave)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="leave",
        entity_id=leave.id,
        after={"employee_id": leave.employee_id, "type": leave.leave_type, "days": float(leave.days_count)},
    )
    db.commit()
    db.refresh(leave)
    return leave


def decide_leave(db: Session, leave_id: str, status: str, actor: User) -> Leave:
    leave = db.get(Leave, leave_id)
    if leave is None:
        raise NotFoundError("طلب الإجازة غير موجود.", code="LEAVE_NOT_FOUND")
    if leave.status == status:
        raise ConflictError("تم اعتماد هذا الطلب بالفعل بنفس الحالة.", code="LEAVE_ALREADY_DECIDED")

    days = Decimal(str(leave.days_count))
    balance_snapshot = None

    if status == "معتمد" and leave.leave_type in BALANCE_FIELDS:
        balance = _get_or_create_balance(db, leave.employee_id, leave.start_date.year)
        used_field, total_field = BALANCE_FIELDS[leave.leave_type]
        remaining = getattr(balance, total_field) - getattr(balance, used_field)
        if days > remaining:
            raise ValidationError(
                f"الرصيد المتاح {remaining} يوم فقط، لا يمكن الاعتماد.", code="LEAVE_BALANCE_EXCEEDED"
            )
        setattr(balance, used_field, getattr(balance, used_field) + days)
        balance_snapshot = {used_field: float(getattr(balance, used_field))}

    previous_status = leave.status
    leave.status = status
    leave.approved_by = actor.full_name
    leave.approval_date = date.today()

    record_audit(
        db,
        actor=actor,
        action="approve" if status == "معتمد" else "reject",
        entity="leave",
        entity_id=leave.id,
        before={"status": previous_status},
        after={"status": status, "balance": balance_snapshot},
    )
    db.commit()
    db.refresh(leave)
    return leave
