"""Permits and missions business rules."""

from datetime import time
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.employee import Employee
from app.models.permit import Mission, Permit
from app.models.user import User
from app.schemas.permit import MissionCreate, PermitCreate
from app.services.audit import record_audit
from app.utils.ids import new_id

PERSONAL_PERMIT = "إذن شخصي"
UNPAID_MISSION = "مأمورية بدون بدل"
REJECTED = "مرفوض"
PERMIT_TOLERANCE_HOURS = Decimal("0.05")


def _ensure_employee(db: Session, employee_id: str) -> None:
    if db.scalar(select(Employee).where(Employee.employee_id == employee_id)) is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")


def _minutes(value: time) -> int:
    return value.hour * 60 + value.minute


def _hours_between(start: time, end: time) -> Decimal:
    """Duration of a same-day permit, rounded to two decimals of an hour."""
    minutes = _minutes(end) - _minutes(start)
    return (Decimal(minutes) / Decimal(60)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def list_permits(db: Session, *, employee_id: str | None = None) -> list[Permit]:
    stmt = select(Permit)
    if employee_id:
        stmt = stmt.where(Permit.employee_id == employee_id)
    return list(db.scalars(stmt.order_by(Permit.date.desc())).all())


def create_permit(db: Session, payload: PermitCreate, actor: User) -> Permit:
    _ensure_employee(db, payload.employee_id)

    if payload.end_time <= payload.start_time:
        raise ValidationError(
            "وقت الانتهاء يجب أن يكون بعد وقت البدء في نفس اليوم.",
            code="PERMIT_TIME_INVALID",
        )

    computed = _hours_between(payload.start_time, payload.end_time)
    declared = Decimal(str(payload.duration_hours))
    if computed <= 0:
        raise ValidationError("مدة الإذن غير صالحة.", code="PERMIT_TIME_INVALID")

    # The stricter of the declared and computed durations is capped, so a client
    # cannot bypass the personal two-hour rule by sending a short window.
    effective = max(declared, computed)
    max_hours = (
        Decimal(str(settings.permit_personal_max_hours))
        if payload.permit_type == PERSONAL_PERMIT
        else Decimal(str(settings.permit_work_max_hours))
    )
    if effective > max_hours:
        code = (
            "PERMIT_DURATION_EXCEEDED"
            if payload.permit_type == PERSONAL_PERMIT
            else "PERMIT_WORK_DURATION_EXCEEDED"
        )
        raise ValidationError(
            f"مدة الإذن تتجاوز الحد المسموح ({max_hours} ساعة).", code=code
        )

    if abs(declared - computed) > PERMIT_TOLERANCE_HOURS:
        raise ValidationError(
            "مدة الإذن لا تطابق وقت البدء والانتهاء.",
            code="PERMIT_TIME_MISMATCH",
        )

    overlap = db.scalar(
        select(Permit).where(
            Permit.employee_id == payload.employee_id,
            Permit.date == payload.date,
            Permit.status != REJECTED,
            Permit.start_time < payload.end_time,
            Permit.end_time > payload.start_time,
        )
    )
    if overlap is not None:
        raise ConflictError(
            "يوجد إذن آخر لنفس الموظف يتداخل مع هذه الفترة.",
            code="PERMIT_OVERLAP",
        )

    same_day_hours = sum(
        (
            Decimal(str(row.duration_hours))
            for row in db.scalars(
                select(Permit).where(
                    Permit.employee_id == payload.employee_id,
                    Permit.date == payload.date,
                    Permit.status != REJECTED,
                )
            ).all()
        ),
        Decimal("0"),
    )
    daily_max = Decimal(str(settings.permit_daily_max_hours))
    if same_day_hours + computed > daily_max:
        raise ValidationError(
            f"إجمالي الأذونات في اليوم يتجاوز الحد المسموح ({daily_max} ساعة).",
            code="PERMIT_DAILY_LIMIT_EXCEEDED",
        )

    permit = Permit(
        id=new_id(),
        is_demo=False,
        status="معتمد",
        approved_by=actor.full_name,
        duration_hours=computed,
        **payload.model_dump(exclude={"duration_hours"}),
    )
    db.add(permit)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="permit",
        entity_id=permit.id,
        after={
            "employee_id": permit.employee_id,
            "type": permit.permit_type,
            "hours": float(computed),
        },
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

    if payload.end_date < payload.start_date:
        raise ValidationError(
            "تاريخ عودة المأمورية يجب أن يكون بعد تاريخ بدئها.",
            code="MISSION_INVALID_RANGE",
        )

    calendar_days = Decimal((payload.end_date - payload.start_date).days + 1)
    days = Decimal(str(payload.days_count))
    if days > calendar_days:
        raise ValidationError(
            "عدد أيام المأمورية أكبر من الفترة المحددة.",
            code="MISSION_DAYS_MISMATCH",
        )
    max_days = Decimal(settings.mission_max_days)
    if days > max_days:
        raise ValidationError(
            f"أقصى مدة للمأمورية {max_days} يومًا.", code="MISSION_DAYS_EXCEEDED"
        )

    if payload.mission_type == UNPAID_MISSION:
        rate = Decimal("0")
    else:
        rate = Decimal(str(payload.allowance_per_day))
        if rate <= 0:
            rate = Decimal(str(settings.mission_default_allowance_per_day))

    max_rate = Decimal(str(settings.mission_max_allowance_per_day))
    if rate > max_rate:
        raise ValidationError(
            f"البدل اليومي يتجاوز الحد الأقصى ({max_rate} ج.م).",
            code="MISSION_ALLOWANCE_EXCEEDED",
        )

    # The allowance is always computed on the server; the client value is only
    # an input for the daily rate and is never trusted as the total.
    total = (days * rate).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    mission = Mission(
        id=new_id(),
        is_demo=False,
        status="معتمد",
        approved_by=actor.full_name,
        allowance_per_day=rate,
        total_allowance=total,
        **payload.model_dump(exclude={"allowance_per_day"}),
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
            "days": float(days),
            "rate": float(rate),
            "total_allowance": float(total),
        },
    )
    db.commit()
    db.refresh(mission)
    return mission
