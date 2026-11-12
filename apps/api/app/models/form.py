"""Document engine: uploaded company forms, templates and filled submissions.

The original document is always kept as-is. Word/Excel files are converted to a
PDF copy for preview/printing; field placement is stored as relative
percentages plus a page number and a data binding.
"""

from typing import Any

from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

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


class FormSubmission(IdMixin, TimestampMixin, Base):
    __tablename__ = "form_submissions"

    template_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("form_templates.id"), nullable=False, index=True
    )
    employee_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    # Resolved values keyed by the field key of the template.
    values: Mapped[dict[str, Any]] = mapped_column(JSONType, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="نهائي")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
