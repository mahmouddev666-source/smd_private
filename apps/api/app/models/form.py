"""Document engine: uploaded company forms, templates and filled submissions.

The original document is always kept as-is. Word/Excel files are converted to a
PDF copy for preview/printing; field placement is stored as relative
percentages plus a page number and a data binding.

Phase 3 adds immutable versions and editor sessions. No existing column is
removed or renamed.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, IdMixin, TimestampMixin

# JSONB on PostgreSQL, plain JSON on SQLite (tests / local dev).
JSONType = JSON().with_variant(JSONB, "postgresql")


class FormFile(IdMixin, TimestampMixin, Base):
    __tablename__ = "form_files"

    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)  # pdf | image | word | excel
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    converted_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    uploaded_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # No FK on purpose: form_files -> form_file_versions -> form_files would be
    # a cycle that breaks `create_all()` on SQLite. VersionService owns it.
    current_version_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)

    versions: Mapped[list["FormFileVersion"]] = relationship(
        back_populates="file", cascade="all, delete-orphan"
    )


class FormFileVersion(IdMixin, Base):
    __tablename__ = "form_file_versions"
    __table_args__ = (
        UniqueConstraint("file_id", "version_no", name="uq_form_file_versions_file_version"),
        Index("ix_form_file_versions_file_version", "file_id", "version_no"),
        Index("ix_form_file_versions_checksum", "checksum"),
        Index(
            "ux_form_file_versions_one_original",
            "file_id",
            unique=True,
            sqlite_where=text("is_original = 1"),
            postgresql_where=text("is_original"),
        ),
        CheckConstraint("version_no >= 1", name="ck_form_file_versions_version_no"),
        CheckConstraint("size_bytes >= 0", name="ck_form_file_versions_size_bytes"),
        CheckConstraint(
            "pdf_status IN ('none', 'pending', 'ready', 'failed')",
            name="ck_form_file_versions_pdf_status",
        ),
        CheckConstraint(
            "kind IN ('word', 'excel', 'pdf', 'image')",
            name="ck_form_file_versions_kind",
        ),
        CheckConstraint(
            "source IN ('upload', 'conversion', 'onlyoffice', 'restore')",
            name="ck_form_file_versions_source",
        ),
    )

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_files.id", ondelete="CASCADE"), nullable=False
    )
    version_no: Mapped[int] = mapped_column(Integer, nullable=False)
    parent_version_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("form_file_versions.id", ondelete="SET NULL"), nullable=True
    )
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    pdf_status: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    mime: Mapped[str] = mapped_column(String(120), nullable=False)
    extension: Mapped[str] = mapped_column(String(16), nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    source: Mapped[str] = mapped_column(String(24), nullable=False)
    is_original: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    file: Mapped[FormFile] = relationship(back_populates="versions")
    parent: Mapped["FormFileVersion | None"] = relationship(
        remote_side=lambda: [FormFileVersion.id], back_populates="children"
    )
    children: Mapped[list["FormFileVersion"]] = relationship(back_populates="parent")


class FormTemplate(IdMixin, TimestampMixin, Base):
    __tablename__ = "form_templates"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="عام")
    description: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_files.id"), nullable=False, index=True
    )
    # List of FieldPlacement dicts: key, binding, page, x, y, width, height…
    fields: Mapped[list[dict[str, Any]]] = mapped_column(JSONType, nullable=False, default=list)
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Pin the layout version the field percentages were designed against.
    document_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("form_file_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    document_version: Mapped["FormFileVersion | None"] = relationship()


class FormSubmission(IdMixin, TimestampMixin, Base):
    __tablename__ = "form_submissions"
    __table_args__ = (
        CheckConstraint("snapshot_attempts >= 0", name="ck_form_submissions_snapshot_attempts"),
        CheckConstraint(
            "snapshot_status IN ('none', 'pending', 'ready', 'failed')",
            name="ck_form_submissions_snapshot_status",
        ),
    )

    template_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_templates.id"), nullable=False, index=True
    )
    employee_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # Resolved values keyed by the field key of the template.
    values: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="نهائي")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    document_version_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("form_file_versions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    rendered_pdf_path: Mapped[str | None] = mapped_column(String(512), nullable=True)
    rendered_checksum: Mapped[str | None] = mapped_column(String(64), nullable=True)
    snapshot_status: Mapped[str] = mapped_column(String(16), nullable=False, default="none")
    snapshot_error: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Retry cap for the background worker (3 attempts).
    snapshot_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    document_version: Mapped["FormFileVersion | None"] = relationship()


class OfficeSession(IdMixin, Base):
    __tablename__ = "office_sessions"
    __table_args__ = (
        Index(
            "ux_office_sessions_open_file",
            "file_id",
            unique=True,
            sqlite_where=text("closed_at IS NULL"),
            postgresql_where=text("closed_at IS NULL"),
        ),
        Index("ix_office_sessions_document_key", "document_key"),
        Index("ix_office_sessions_file_id", "file_id"),
        Index("ix_office_sessions_version_id", "version_id"),
        CheckConstraint(
            "close_reason IN ('saved', 'saved_with_error', 'no_changes', 'expired', 'forced')",
            name="ck_office_sessions_close_reason",
        ),
    )

    file_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_files.id", ondelete="CASCADE"), nullable=False
    )
    version_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_file_versions.id", ondelete="SET NULL"), nullable=False
    )
    document_key: Mapped[str] = mapped_column(String(128), nullable=False)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False)
    user_name: Mapped[str] = mapped_column(String(160), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_reason: Mapped[str | None] = mapped_column(String(24), nullable=True)

    file: Mapped[FormFile] = relationship()
    version: Mapped[FormFileVersion] = relationship()
