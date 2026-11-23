"""HR Admin endpoints for approved shift/overtime settings (T3-19)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.core.security import DOCUMENT_EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.settings import WorkSettingsOut, WorkSettingsUpdate
from app.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get(
    "/work",
    response_model=WorkSettingsOut,
    status_code=status.HTTP_200_OK,
)
def get_work_settings(
    # Read-only values are needed by the overtime calculator for every signed-in
    # role; editing them below is still restricted to ADMIN/HR.
    _: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> WorkSettingsOut:
    return settings_service.to_out(settings_service.get_work_settings(db))


@router.patch(
    "/work",
    response_model=WorkSettingsOut,
    status_code=status.HTTP_200_OK,
)
def patch_work_settings(
    patch: WorkSettingsUpdate,
    actor: User = Depends(require_role(*DOCUMENT_EDITOR_ROLES)),
    db: Session = Depends(get_db),
) -> WorkSettingsOut:
    return settings_service.to_out(settings_service.update_work_settings(db, patch, actor))
