"""Permits and missions business rules."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError, ValidationError
from app.models.employee import Employee
from app.models.permit import Mission, Permit
from app.models.user import User
from app.schemas.permit import MissionCreate, PermitCreate
from app.services.audit import record_audit
from app.utils.ids import new_id

MAX_PERSONAL_PERMIT_HOURS = Decimal("2")


def _ensure_employee(db: Session, employee_id: str) -> None:
    if db.scalar(select(Employee).where(Employee.employee_id == employee_id)) is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")


def list_permits(db: Session, *, employee_id: str | None = None) -> list[Permit]:
    stmt = select(Permit)
    if employee_id:
        stmt = stmt.where(Permit.employee_id == employee_id)
    return list(db.scalars(stmt.order_by(Permit.date.desc())).all())


def create_permit(db: Session, payload: PermitCreate, actor: User) -> Permit:
    _ensure_employee(db, payload.employee_id)
    if payload.permit_type == "إذن شخصي" and Decimal(str(payload.duration_hours)) > MAX_PERSONAL_PERMIT_HOURS:
        raise ValidationError(
            "الإذن الشخصي لا يتجاوز ساعتين طبقًا للائحة.", code="PERMIT_DURATION_EXCEEDED"
        )

    permit = Permit(
        id=new_id(),
        is_demo=False,
        status="معتمد",
        approved_by=actor.full_name,
        **payload.model_dump(),
    )
    db.add(permit)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="permit",
        entity_id=permit.id,
        after={"employee_id": permit.employee_id, "type": permit.permit_type},
    )
    db.commit()
    db.refresh(permit)
    return permit


def list_missions(db: Session, *, employee_id: str | None = None) -> list[Mission]:
    stmt = select(Mission)
    if employee_id:
        stmt = stmt.where(Mission.employee_id == employee_id)
    return list(db.scalars(stmt.order_by(Mission.start_date.desc())).all())


def create_mission(db: Session, payload: MissionCreate, actor: User) -> Mission:
    _ensure_employee(db, payload.employee_id)
    total = Decimal(str(payload.days_count)) * Decimal(str(payload.allowance_per_day))

    mission = Mission(
        id=new_id(),
        is_demo=False,
        status="معتمد",
        approved_by=actor.full_name,
        total_allowance=total,
        **payload.model_dump(),
    )
    db.add(mission)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="mission",
        entity_id=mission.id,
        after={
            "employee_id": mission.employee_id,
            "destination": mission.destination,
            "total_allowance": float(total),
        },
    )
    db.commit()
    db.refresh(mission)
    return mission
