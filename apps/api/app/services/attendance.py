"""Attendance business rules: one record per employee per day (upsert)."""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import NotFoundError
from app.models.attendance import Attendance
from app.models.employee import Employee
from app.models.user import User
from app.schemas.attendance import AttendanceUpsert
from app.services.audit import record_audit
from app.utils.ids import new_id

def list_attendance(
    db: Session,
    *,
    employee_id: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[list[Attendance], int]:
    stmt = select(Attendance)
    if employee_id:
        stmt = stmt.where(Attendance.employee_id == employee_id)
    if date_from:
        stmt = stmt.where(Attendance.date >= date_from)
    if date_to:
        stmt = stmt.where(Attendance.date <= date_to)
    total = len(db.scalars(stmt).all())
    rows = db.scalars(
        stmt.order_by(Attendance.date.desc(), Attendance.employee_id).limit(limit).offset(offset)
    ).all()
    return list(rows), total


def upsert_attendance(db: Session, payload: AttendanceUpsert, actor: User) -> tuple[Attendance, bool]:
    employee = db.scalar(select(Employee).where(Employee.employee_id == payload.employee_id))
    if employee is None:
        raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")

    existing = db.scalar(
        select(Attendance).where(
            Attendance.employee_id == payload.employee_id,
            Attendance.date == payload.date,
        )
    )
    if existing is None:
        record = Attendance(id=new_id(), is_demo=False, **payload.model_dump())
        db.add(record)
        created = True
    else:
        for field, value in payload.model_dump().items():
            setattr(existing, field, value)
        record = existing
        created = False

    record_audit(
        db,
        actor=actor,
        action="create" if created else "update",
        entity="attendance",
        entity_id=f"{payload.employee_id}:{payload.date.isoformat()}",
        after={"status": record.status, "check_in": str(record.check_in), "check_out": str(record.check_out)},
    )
    db.commit()
    db.refresh(record)
    return record, created


def delete_attendance(db: Session, record_id: str, actor: User) -> None:
    record = db.get(Attendance, record_id)
    if record is None:
        raise NotFoundError("سجل الحضور غير موجود.", code="ATTENDANCE_NOT_FOUND")
    record_audit(
        db,
        actor=actor,
        action="delete",
        entity="attendance",
        entity_id=record.id,
        before={"employee_id": record.employee_id, "date": record.date.isoformat()},
    )
    db.delete(record)
    db.commit()
