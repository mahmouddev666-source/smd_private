"""T3-09…T3-13: /api/office/* endpoints.

Every response (including errors and file streams) gets ``Cache-Control:
no-store`` via the custom route class, so short-lived URLs are never cached.
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Body, Depends, Query, Request, Response, status
from fastapi.responses import FileResponse
from fastapi.routing import APIRoute

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import DOCUMENT_EDITOR_ROLES, get_current_user, require_role
from app.db.session import get_db
from app.models.user import User
from app.schemas.office import (
    CloseSessionIn,
    OfficeCallbackOut,
    OfficeConfigOut,
    OfficeConvertOut,
    OfficeStatusOut,
    OfficeVersionListOut,
)
from app.services import forms, office as service, office_callback, office_jwt, office_tokens, versions

logger = logging.getLogger("smd_hr.office")

_NO_STORE_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
}


class NoStoreRoute(APIRoute):
    def get_route_handler(self):
        original = super().get_route_handler()

        async def add_no_store(request: Request) -> Response:
            response = await original(request)
            response.headers["Cache-Control"] = "no-store"
            return response

        return add_no_store


router = APIRouter(prefix="/office", tags=["office"], route_class=NoStoreRoute)


def _bearer(header: str | None) -> str | None:
    if not header:
        return None
    scheme, _, token = header.partition(" ")
    return token.strip() if scheme.lower() == "bearer" and token.strip() else None


@router.get("/status", response_model=OfficeStatusOut)
def office_status(_: User = Depends(get_current_user)) -> dict:
    return service.office_status()


@router.get("/config/{file_id}", response_model=OfficeConfigOut)
def editor_config(
    file_id: str,
    version_id: str | None = None,
    db=Depends(get_db),
    actor: User = Depends(require_role(*DOCUMENT_EDITOR_ROLES)),
) -> dict:
    return service.prepare_editor(db, file_id, actor, version_id)


@router.get("/download/{file_id}", response_class=FileResponse)
def download_for_ds(
    file_id: str,
    request: Request,
    token: str | None = Query(default=None),
    db=Depends(get_db),
) -> FileResponse:
    claims = office_tokens.verify_token(
        token, audience=office_tokens.AUDIENCE_DOWNLOAD, file_id=file_id
    )
    t3_token = _bearer(request.headers.get("authorization"))
    if t3_token or settings.office_require_ds_download_token:
        target = request.url.path + (f"?{request.url.query}" if request.url.query else "")
        office_jwt.verify_download(t3_token, target)

    file = forms.get_file(db, file_id)
    version = versions.get_version(db, file, claims["vid"])
    path, filename, media_type = service.version_download_target(file, version)
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type="attachment",
        headers=dict(_NO_STORE_HEADERS),
    )


@router.post("/callback/{file_id}", response_model=OfficeCallbackOut)
async def office_callback_endpoint(
    file_id: str,
    request: Request,
    body: dict[str, Any] = Body(default_factory=dict),
    token: str | None = Query(default=None),
    db=Depends(get_db),
) -> dict:
    t3_token = _bearer(request.headers.get("authorization")) or body.get("token")
    try:
        return office_callback.handle_callback(
            db,
            file_id=file_id,
            t2_token=token,
            t3_token=t3_token if isinstance(t3_token, str) else None,
            body=body,
        )
    except AppError as exc:
        raise office_callback._as_rejected(exc) from exc
    except Exception:  # noqa: BLE001 - DS must never see a retry-inducing 5xx
        logger.exception("Office callback failed for file %s", file_id)
        return {"error": 1}


@router.get("/files/{file_id}/versions", response_model=OfficeVersionListOut)
def list_versions(
    file_id: str,
    db=Depends(get_db),
    _: User = Depends(get_current_user),
) -> dict:
    file = forms.get_file(db, file_id)
    items = [service.version_out(db, version) for version in versions.list_versions(db, file)]
    return {"items": items, "total": len(items)}


@router.get("/files/{file_id}/versions/{version_id}/download", response_class=FileResponse)
def download_version(
    file_id: str,
    version_id: str,
    disposition: Literal["attachment", "inline"] = "attachment",
    db=Depends(get_db),
    _: User = Depends(require_role(*DOCUMENT_EDITOR_ROLES)),
) -> FileResponse:
    file = forms.get_file(db, file_id)
    version = versions.get_version(db, file, version_id)
    path, filename, media_type = service.version_download_target(file, version)
    return FileResponse(
        path,
        media_type=media_type,
        filename=filename,
        content_disposition_type=disposition,
        headers=dict(_NO_STORE_HEADERS),
    )


@router.get("/files/{file_id}/versions/{version_id}/preview", response_class=FileResponse)
def preview_version(
    file_id: str,
    version_id: str,
    db=Depends(get_db),
    _: User = Depends(get_current_user),
) -> FileResponse:
    file = forms.get_file(db, file_id)
    version = versions.get_version(db, file, version_id)
    path, filename = service.version_preview_target(file, version)
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=filename,
        content_disposition_type="inline",
        headers=dict(_NO_STORE_HEADERS),
    )


@router.post(
    "/files/{file_id}/convert",
    response_model=OfficeConvertOut,
    status_code=status.HTTP_202_ACCEPTED,
)
def convert_legacy(
    file_id: str,
    db=Depends(get_db),
    actor: User = Depends(require_role(*DOCUMENT_EDITOR_ROLES)),
) -> dict:
    file = forms.get_file(db, file_id)
    version = service.convert_legacy_version(db, file, actor)
    return {"versionId": version.id, "number": version.version_no}


@router.post(
    "/files/{file_id}/sessions/close",
    response_model=None,
    status_code=status.HTTP_204_NO_CONTENT,
)
def close_session(
    file_id: str,
    payload: CloseSessionIn = Body(default_factory=CloseSessionIn),
    db=Depends(get_db),
    actor: User = Depends(require_role(*DOCUMENT_EDITOR_ROLES)),
) -> None:
    service.close_active_session(db, file_id, payload.reason, actor)
