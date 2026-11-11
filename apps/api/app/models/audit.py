"""Audit trail for every write operation."""

from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, utcnow


class AuditLog(IdMixin, Base):
    __tablename__ = "audit_logs"

    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(160), nullable=False, default="system")
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    entity: Mapped[str] = mapped_column(String(60), nullable=False)
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    before: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    after: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )
