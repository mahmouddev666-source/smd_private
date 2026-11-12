"""Document-engine business rules: files, templates and submissions."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.employee import Employee
from app.models.form import FormFile, FormSubmission, FormTemplate
from app.models.user import User
from app.schemas.form import SubmissionCreate, TemplateCreate, TemplateUpdate
from app.services import documents
from app.services.audit import record_audit
from app.utils.ids import new_id


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


def store_file(db: Session, upload: UploadFile, actor: User) -> FormFile:
    data = documents.read_upload(upload)
    filename = documents.sanitize_filename(upload.filename)
    stored = documents.store_document(filename, data)

    file = FormFile(
        id=new_id(),
        original_name=filename,
        mime=stored.mime,
        kind=stored.kind,
        size_bytes=stored.size_bytes,
        checksum=stored.checksum,
        storage_path=stored.storage_path,
        converted_pdf_path=stored.converted_pdf_path,
        page_count=stored.page_count,
        uploaded_by=actor.id,
        is_active=True,
        is_demo=False,
    )
    db.add(file)
    record_audit(
        db,
        actor=actor,
        action="upload",
        entity="form_file",
        entity_id=file.id,
        after={"_snapshot": _file_snapshot(file)},
    )
    db.commit()
    db.refresh(file)
    return file
def list_files(db: Session, *, limit: int = 50, offset: int = 0) -> tuple[list[FormFile], int]:
    stmt = select(FormFile).where(FormFile.is_active.is_(True))
    total = len(db.scalars(stmt).all())
    rows = db.scalars(stmt.order_by(FormFile.created_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def get_file(db: Session, file_id: str, *, include_inactive: bool = False) -> FormFile:
    record = db.get(FormFile, file_id)
    if record is None or (not include_inactive and not record.is_active):
        raise NotFoundError("ملف المستند غير موجود.", code="FORM_FILE_NOT_FOUND")
    return record


def deactivate_file(db: Session, file_id: str, actor: User) -> None:
    record = get_file(db, file_id)
    in_use = db.scalar(
        select(FormTemplate.id).where(
            FormTemplate.file_id == record.id, FormTemplate.is_active.is_(True)
        )
    )
    if in_use:
        raise ConflictError(
            "لا يمكن حذف الملف لارتباطه بقالب نشط. احذف القالب أولًا.",
            code="FORM_FILE_IN_USE",
        )

    before = _file_snapshot(record)
    record.is_active = False
    record_audit(
        db,
        actor=actor,
        action="deactivate",
        entity="form_file",
        entity_id=record.id,
        before={"_snapshot": before},
        after={"_snapshot": _file_snapshot(record)},
    )
    db.commit()


def download_target(file: FormFile) -> tuple[Path, str, str]:
    """Return (path, download name, media type) for inline preview/print."""
    kind = file.kind
    if kind == "pdf":
        relative = file.storage_path
        media_type = "application/pdf"
        name = f"{Path(file.original_name).stem}.pdf"
    elif kind == "image":
        relative = file.storage_path
        media_type = file.mime
        name = file.original_name
    else:
        if not file.converted_pdf_path:
            raise NotFoundError(
                "النسخة المعروضة من المستند غير متاحة. أعد رفع الملف.",
                code="FORM_FILE_PREVIEW_MISSING",
            )
        relative = file.converted_pdf_path
        media_type = "application/pdf"
        name = f"{Path(file.original_name).stem}.pdf"

    path = documents.resolve_storage_path(relative)
    if not path.exists():
        raise NotFoundError(
            "ملف المستند مفقود من التخزين. أعد رفعه.", code="FORM_FILE_CONTENT_MISSING"
        )
    return path, name, media_type


def _file_snapshot(file: FormFile) -> dict[str, Any]:
    return {
        "original_name": file.original_name,
        "mime": file.mime,
        "kind": file.kind,
        "size_bytes": file.size_bytes,
        "page_count": file.page_count,
        "is_active": file.is_active,
    }


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


def _active_file(db: Session, file_id: str) -> FormFile:
    return get_file(db, file_id)


def list_templates(
    db: Session,
    *,
    search: str | None = None,
    category: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FormTemplate], int]:
    stmt = select(FormTemplate).where(FormTemplate.is_active.is_(True))
    if search:
        like = f"%{search.strip()}%"
        stmt = stmt.where(or_(FormTemplate.name.ilike(like), FormTemplate.description.ilike(like)))
    if category and category != "ALL":
        stmt = stmt.where(FormTemplate.category == category)
    total = len(db.scalars(stmt).all())
    rows = db.scalars(stmt.order_by(FormTemplate.updated_at.desc()).limit(limit).offset(offset)).all()
    return list(rows), total


def get_template(db: Session, template_id: str) -> FormTemplate:
    template = db.get(FormTemplate, template_id)
    if template is None or not template.is_active:
        raise NotFoundError("قالب النموذج غير موجود.", code="FORM_TEMPLATE_NOT_FOUND")
    return template


def create_template(db: Session, payload: TemplateCreate, actor: User) -> FormTemplate:
    _active_file(db, payload.file_id)
    template = FormTemplate(
        id=new_id(),
        name=payload.name.strip(),
        category=payload.category.strip(),
        description=payload.description.strip(),
        file_id=payload.file_id,
        fields=[field.model_dump() for field in payload.fields],
        created_by=actor.id,
        is_active=True,
        is_demo=False,
    )
    db.add(template)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="form_template",
        entity_id=template.id,
        after=_template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def update_template(
    db: Session, template_id: str, payload: TemplateUpdate, actor: User
) -> FormTemplate:
    template = get_template(db, template_id)
    before = _template_snapshot(template)

    changes = payload.model_dump(exclude_unset=True)
    if changes.get("name") is not None:
        changes["name"] = changes["name"].strip()
    if changes.get("category") is not None:
        changes["category"] = changes["category"].strip()
    if changes.get("description") is not None:
        changes["description"] = changes["description"].strip()
    if changes.get("is_active") is False:
        # Handled by the delete endpoint; keeps PATCH idempotent.
        changes.pop("is_active")

    for field, value in changes.items():
        if value is not None:
            setattr(template, field, value)

    record_audit(
        db,
        actor=actor,
        action="update",
        entity="form_template",
        entity_id=template.id,
        before=before,
        after=_template_snapshot(template),
    )
    db.commit()
    db.refresh(template)
    return template


def deactivate_template(db: Session, template_id: str, actor: User) -> None:
    template = get_template(db, template_id)
    before = _template_snapshot(template)
    template.is_active = False
    record_audit(
        db,
        actor=actor,
        action="deactivate",
        entity="form_template",
        entity_id=template.id,
        before=before,
        after=_template_snapshot(template),
    )
    db.commit()


def _template_snapshot(template: FormTemplate) -> dict[str, Any]:
    return {
        "name": template.name,
        "category": template.category,
        "file_id": template.file_id,
        "fields_count": len(template.fields or []),
        "is_active": template.is_active,
    }


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


def create_submission(db: Session, payload: SubmissionCreate, actor: User) -> FormSubmission:
    template = get_template(db, payload.template_id)

    if payload.employee_id:
        employee = db.scalar(
            select(Employee).where(
                Employee.employee_id == payload.employee_id, Employee.is_active.is_(True)
            )
        )
        if employee is None:
            raise NotFoundError("الموظف غير موجود.", code="EMPLOYEE_NOT_FOUND")

    allowed = {str(field.get("key")) for field in (template.fields or [])}
    unknown = sorted(set(payload.values) - allowed)
    if unknown:
        raise ValidationError(
            "حقول غير معروفة في القالب: " + ", ".join(unknown), code="UNKNOWN_FORM_FIELD"
        )
    for key, value in payload.values.items():
        if isinstance(value, (dict, list)):
            raise ValidationError(
                f"قيمة الحقل «{key}» يجب أن تكون نصًا أو رقمًا.", code="INVALID_FORM_VALUE"
            )

    submission = FormSubmission(
        id=new_id(),
        template_id=template.id,
        employee_id=payload.employee_id,
        values=payload.values,
        status=payload.status,
        created_by=actor.id,
        is_demo=False,
    )
    db.add(submission)
    record_audit(
        db,
        actor=actor,
        action="create",
        entity="form_submission",
        entity_id=submission.id,
        after={
            "template_id": template.id,
            "employee_id": submission.employee_id,
            "status": submission.status,
            "fields_filled": len(payload.values),
        },
    )
    db.commit()
    db.refresh(submission)
    return submission


def list_submissions(
    db: Session,
    *,
    template_id: str | None = None,
    employee_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[FormSubmission], int]:
    stmt = select(FormSubmission)
    if template_id:
        stmt = stmt.where(FormSubmission.template_id == template_id)
    if employee_id:
        stmt = stmt.where(FormSubmission.employee_id == employee_id)
    total = len(db.scalars(stmt).all())
    rows = db.scalars(
        stmt.order_by(FormSubmission.created_at.desc()).limit(limit).offset(offset)
    ).all()
    return list(rows), total
