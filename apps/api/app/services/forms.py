"""Document-engine business rules: files, templates and submissions."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ConflictError, NotFoundError, ValidationError
from app.models.employee import Employee
from app.models.form import FormFile, FormFileVersion, FormSubmission, FormTemplate
from app.models.user import User
from app.schemas.form import SubmissionCreate, TemplateCreate, TemplateUpdate
from app.services import documents, render, versions
from app.services.audit import record_audit
from app.utils.ids import new_id

# A background retry never runs more than three times (T3-16).
SNAPSHOT_MAX_ATTEMPTS = 3


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
    db.flush()
    record_audit(
        db,
        actor=actor,
        action="upload",
        entity="form_file",
        entity_id=file.id,
        after={"_snapshot": _file_snapshot(file)},
    )

    # T3-06: every file gets an immutable v1. A legacy .doc/.xls additionally
    # gets a converted OOXML v2 which becomes the current editable version.
    extension = Path(stored.storage_path).suffix.lstrip(".").lower()
    original_pdf = Path(stored.converted_pdf_path) if stored.converted_pdf_path else None
    v1 = versions.create_version(
        db,
        file,
        data=data,
        kind=stored.kind,
        extension=extension,
        mime=stored.mime,
        source="upload",
        actor=actor,
        is_original=True,
        pdf_path=stored.converted_pdf_path,
        pdf_status="ready" if original_pdf and original_pdf.exists() else "none",
    )
    if (
        stored.kind in documents.OFFICE_KINDS
        and extension in {"doc", "xls"}
        and settings.office_legacy_convert_on_upload
    ):
        converted = documents.convert_legacy(documents.resolve_storage_path(stored.storage_path))
        converted_extension = "docx" if stored.kind == "word" else "xlsx"
        converted_mime = documents.DOCX_MIME if stored.kind == "word" else documents.XLSX_MIME
        v2 = versions.create_version(
            db,
            file,
            data=converted,
            kind=stored.kind,
            extension=converted_extension,
            mime=converted_mime,
            source="conversion",
            parent_id=v1.id,
            actor=actor,
        )
        documents.render_pdf_for_version(db, file, v2)

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


def download_target(
    db: Session, file: FormFile, version_id: str | None = None
) -> tuple[Path, str, str]:
    """Return (path, download name, media type) for inline preview/print.

    ``version_id`` pins the request to one immutable version. When omitted the
    current version PDF is served, preserving the pre-Phase-3 contract.
    """
    if version_id:
        version = versions.get_version(db, file, version_id)
        if version.pdf_status != "ready" or not version.pdf_path:
            raise NotFoundError(
                "معاينة هذا الإصدار غير جاهزة بعد.", code="OFFICE_VERSION_PREVIEW_MISSING"
            )
        relative = version.pdf_path
        media_type = "application/pdf"
        name = f"{Path(file.original_name).stem}_v{version.version_no}.pdf"
    else:
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
    file = _active_file(db, payload.file_id)
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
        # Pin the layout the field percentages were designed against.
        document_version_id=file.current_version_id,
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

    # Freeze the layout version at creation time. It never changes afterwards.
    version_id = template.document_version_id
    if not version_id and template.file_id:
        file = db.get(FormFile, template.file_id)
        version_id = file.current_version_id if file else None
    if version_id:
        version = db.get(FormFileVersion, version_id)
        if version is None or version.file_id != template.file_id:
            raise ValidationError(
                "الإصدار المثبّت للقالب غير صالح.", code="OFFICE_VERSION_NOT_FOUND"
            )

    submission = FormSubmission(
        id=new_id(),
        template_id=template.id,
        employee_id=payload.employee_id,
        values=payload.values,
        status=payload.status,
        created_by=actor.id,
        is_demo=False,
        document_version_id=version_id,
        snapshot_status="pending" if settings.submission_snapshot_enabled else "none",
        snapshot_attempts=0,
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
            "document_version_id": version_id,
            "snapshot_status": submission.snapshot_status,
        },
    )
    db.commit()
    db.refresh(submission)
    return submission


def get_submission(db: Session, submission_id: str) -> FormSubmission:
    submission = db.get(FormSubmission, submission_id)
    if submission is None:
        raise NotFoundError("الطلب غير موجود.", code="FORM_SUBMISSION_NOT_FOUND")
    return submission


def process_snapshot(db: Session, submission_id: str) -> None:
    """Attempt one non-blocking render; failures never raise to the caller.

    Both the FastAPI background task and the retrying worker call this, so the
    attempt counter and audit trail stay in one place.
    """
    submission = db.get(FormSubmission, submission_id)
    if submission is None or submission.snapshot_status in ("ready", "none"):
        return

    submission.snapshot_attempts += 1
    try:
        relative, checksum = render.render_snapshot(db, submission)
    except render.SnapshotRenderError as exc:
        submission.snapshot_status = "failed"
        submission.snapshot_error = exc.message[:500]
        action = "forms.snapshot.failed"
        after: dict[str, Any] = {"code": exc.code, "attempts": submission.snapshot_attempts}
        if submission.snapshot_attempts >= SNAPSHOT_MAX_ATTEMPTS:
            action = "forms.snapshot.exhausted"
        record_audit(db, actor=None, action=action, entity="form_submission",
                     entity_id=submission.id, after=after)
        db.commit()
        return
    except Exception as exc:  # noqa: BLE001 - a bad render must not kill a worker
        submission.snapshot_status = "failed"
        submission.snapshot_error = "تعذّر توليد لقطة PDF لهذا الطلب. سيُعاد المحاولة لاحقًا."
        action = "forms.snapshot.failed"
        after = {"code": "SNAPSHOT_RENDER_FAILED", "attempts": submission.snapshot_attempts}
        if submission.snapshot_attempts >= SNAPSHOT_MAX_ATTEMPTS:
            action = "forms.snapshot.exhausted"
        record_audit(db, actor=None, action=action, entity="form_submission",
                     entity_id=submission.id, after=after)
        db.commit()
        return

    submission.rendered_pdf_path = relative
    submission.rendered_checksum = checksum
    submission.snapshot_status = "ready"
    submission.snapshot_error = None
    record_audit(
        db,
        actor=None,
        action="forms.snapshot.ready",
        entity="form_submission",
        entity_id=submission.id,
        after={"checksum": checksum[:12], "attempts": submission.snapshot_attempts},
    )
    db.commit()


def submission_document_target(submission: FormSubmission) -> tuple[Path, str]:
    """Serve a completed snapshot inline; never expose the storage path."""
    if submission.snapshot_status != "ready" or not submission.rendered_pdf_path:
        raise NotFoundError(
            "لقطة PDF لهذا الطلب غير جاهزة بعد.", code="SNAPSHOT_NOT_READY"
        )
    path = documents.resolve_storage_path(submission.rendered_pdf_path)
    if not path.is_file():
        raise NotFoundError("لقطة PDF لهذا الطلب مفقودة من التخزين.", code="SNAPSHOT_NOT_READY")
    return path, f"submission-{submission.id[:8]}.pdf"


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
