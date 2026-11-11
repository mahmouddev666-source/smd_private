"""Audit log helper: one row per write operation."""

from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog
from app.models.user import User
from app.utils.ids import new_id


def record_audit(
    db: Session,
    *,
    actor: User | None,
    action: str,
    entity: str,
    entity_id: str | None = None,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> AuditLog:
    log = AuditLog(
        id=new_id(),
        actor_id=actor.id if actor else None,
        actor_name=actor.full_name if actor else "system",
        action=action,
        entity=entity,
        entity_id=entity_id,
        before=before,
        after=after,
    )
    db.add(log)
    return log
