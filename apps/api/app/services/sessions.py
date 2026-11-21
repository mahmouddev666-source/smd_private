"""T3-10: exclusive, expiring ONLYOFFICE editing sessions."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.models.form import FormFile, FormFileVersion, OfficeSession
from app.models.user import User
from app.services.audit import record_audit
from app.utils.ids import new_id


def document_key(file_id: str, version_id: str) -> str:
    """DS cache key — changes with every immutable version."""
    return f"smd-{file_id}-{version_id}"


def as_utc(value: datetime) -> datetime:
    """SQLite drops tzinfo; normalise before comparing/serialising."""
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def get_session(db: Session, session_id: str | None) -> OfficeSession | None:
    if not session_id:
        return None
    return db.get(OfficeSession, session_id)


def get_active_session(db: Session, file_id: str) -> OfficeSession | None:
    return db.scalar(
        select(OfficeSession)
        .where(OfficeSession.file_id == file_id, OfficeSession.closed_at.is_(None))
        .order_by(OfficeSession.created_at.desc())
    )


def touch_session(db: Session, session: OfficeSession) -> None:
    session.last_seen_at = datetime.now(timezone.utc)
    db.commit()


def close_session(
    db: Session,
    session: OfficeSession,
    reason: str,
    *,
    actor: User | None = None,
) -> None:
    if session.closed_at is not None:
        return
    session.closed_at = datetime.now(timezone.utc)
    session.close_reason = reason
    record_audit(
        db,
        actor=actor,
        action="office.session.close",
        entity="office_session",
        entity_id=session.id,
        after={"file_id": session.file_id, "reason": reason},
    )
    db.commit()


def open_session(
    db: Session,
    file: FormFile,
    version: FormFileVersion,
    user: User,
) -> OfficeSession:
    now = datetime.now(timezone.utc)
    active = get_active_session(db, file.id)
    if active is not None and as_utc(active.expires_at) > now:
        if active.user_id == user.id:
            # Same user reconnecting: keep the same document key/token shape.
            touch_session(db, active)
            return active
        error = AppError(
            409,
            "ملف المستند مفتوح للتحرير من قِبل مستخدم آخر حاليًا.",
            "OFFICE_SESSION_ACTIVE",
        )
        error.detail["owner"] = active.user_name
        raise error
    if active is not None:
        close_session(db, active, "expired")

    session = OfficeSession(
        id=new_id(),
        file_id=file.id,
        version_id=version.id,
        document_key=document_key(file.id, version.id),
        user_id=user.id,
        user_name=user.full_name,
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(minutes=settings.office_session_ttl_minutes),
        closed_at=None,
        close_reason=None,
    )
    db.add(session)
    record_audit(
        db,
        actor=user,
        action="office.session.open",
        entity="office_session",
        entity_id=session.id,
        after={"file_id": file.id, "version_id": version.id},
    )
    db.commit()
    db.refresh(session)
    return session
