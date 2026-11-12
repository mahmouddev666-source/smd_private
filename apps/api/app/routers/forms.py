"""Document engine endpoints: upload, preview, templates and submissions."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.security import EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import Page
from app.schemas.form import (
    FormFileOut,
    SubmissionCreate,
    SubmissionOut,
    TemplateCreate,
    TemplateOut,
    TemplateUpdate,
)
from app.services import forms as service

router = APIRouter(prefix="/forms", tags=["forms"])


# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------


@router.post("/files", response_model=FormFileOut, status_code=status.HTTP_201_CREATED)
def upload_file(
    file: UploadFile = File(..., description="PDF / Word / Excel / PNG / JPEG (max 20MB)"),
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> FormFileOut:
    record = service.store_file(db, file, actor)
    return FormFileOut.model_validate(record)


@router.get("/files", response_model=Page[FormFileOut])
def list_files(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[FormFileOut]:
    rows, total = service.list_files(db, limit=limit, offset=offset)
    return Page(
        items=[FormFileOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/files/{file_id}", response_model=FormFileOut)
def get_file(
    file_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FormFileOut:
    return FormFileOut.model_validate(service.get_file(db, file_id))


@router.get("/files/{file_id}/download", response_class=FileResponse)
def download_file(
    file_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    record = service.get_file(db, file_id)
    path, filename, media_type = service.download_target(record)
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete("/files/{file_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    file_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> None:
    service.deactivate_file(db, file_id, actor)


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------


@router.post("/templates", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> TemplateOut:
    return TemplateOut.model_validate(service.create_template(db, payload, actor))


@router.get("/templates", response_model=Page[TemplateOut])
def list_templates(
    search: str | None = None,
    category: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[TemplateOut]:
    rows, total = service.list_templates(
        db, search=search, category=category, limit=limit, offset=offset
    )
    return Page(
        items=[TemplateOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/templates/{template_id}", response_model=TemplateOut)
def get_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TemplateOut:
    return TemplateOut.model_validate(service.get_template(db, template_id))


@router.patch("/templates/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: str,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> TemplateOut:
    return TemplateOut.model_validate(service.update_template(db, template_id, payload, actor))


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> None:
    service.deactivate_template(db, template_id, actor)


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------


@router.post("/submissions", response_model=SubmissionOut, status_code=status.HTTP_201_CREATED)
def create_submission(
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_role(*EDITOR_ROLES)),
) -> SubmissionOut:
    return SubmissionOut.model_validate(service.create_submission(db, payload, actor))


@router.get("/submissions", response_model=Page[SubmissionOut])
def list_submissions(
    template_id: str | None = None,
    employee_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> Page[SubmissionOut]:
    rows, total = service.list_submissions(
        db, template_id=template_id, employee_id=employee_id, limit=limit, offset=offset
    )
    return Page(
        items=[SubmissionOut.model_validate(row) for row in rows],
        total=total,
        limit=limit,
        offset=offset,
    )
