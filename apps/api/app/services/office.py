"""T3-09/T3-10/T3-13: editor configuration, status and version helpers."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.models.form import FormFile, FormFileVersion
from app.models.user import User
from app.services import documents, forms, office_jwt, office_tokens, sessions, versions
from app.services.audit import record_audit

# 30-second in-process cache; a healthcheck failure is never a 5xx for the UI.
_health_cache: tuple[float, dict] | None = None
HEALTH_CACHE_SECONDS = 30


def require_enabled() -> None:
    if not settings.onlyoffice_enabled:
        raise AppError(
            503,
            "محرّر المستندات غير مفعّل على هذا الخادم.",
            "OFFICE_DISABLED",
        )


def office_status() -> dict:
    """Return capability info without leaking the internal DS URL."""
    global _health_cache
    checked_at = datetime.now(timezone.utc)
    if not settings.onlyoffice_enabled:
        return {
            "enabled": False,
            "available": False,
            "documentserverVersion": None,
            "checkedAt": checked_at,
        }

    now = time.monotonic()
    if _health_cache is not None and now - _health_cache[0] < HEALTH_CACHE_SECONDS:
        return _health_cache[1]

    available = False
    server_version: str | None = None
    try:
        response = httpx.get(
            f"{settings.onlyoffice_internal_url.rstrip('/')}/healthcheck",
            timeout=2.0,
        )
        available = response.status_code < 400
        if available:
            try:
                body = response.json()
                if isinstance(body, dict):
                    server_version = str(body.get("version") or "") or None
            except Exception:  # noqa: BLE001 - healthcheck body is optional
                server_version = None
            if server_version is None:
                server_version = response.headers.get("x-documentserver-version") or None
    except Exception:  # noqa: BLE001 - offline DS must not break the API
        available = False
        server_version = None

    result = {
        "enabled": True,
        "available": available,
        "documentserverVersion": server_version,
        "checkedAt": checked_at,
    }
    _health_cache = (now, result)
    return result


def _permissions() -> dict:
    return {
        "edit": True,
        "download": False,
        "print": True,
        "copy": True,
        "comment": False,
        "review": False,
        "fillForms": True,
    }


def build_config(
    file: FormFile,
    version: FormFileVersion,
    session,
    user: User,
) -> dict:
    """Assemble the DS config, sign it with T3 and embed the two T2 URLs."""
    base = settings.onlyoffice_callback_base.rstrip("/")
    download_token = office_tokens.issue_download_token(
        user_id=user.id, file_id=file.id, version_id=version.id
    )
    callback_token = office_tokens.issue_callback_token(
        file_id=file.id, session_id=session.id, user_id=user.id
    )
    config = {
        "documentType": "word" if file.kind == "word" else "cell",
        "document": {
            "fileType": version.extension,
            "key": session.document_key,
            "title": f"{Path(file.original_name).stem}.{version.extension}",
            "url": f"{base}/api/office/download/{file.id}?token={download_token}",
            "permissions": _permissions(),
        },
        "editorConfig": {
            "mode": "edit",
            "lang": "ar",
            "callbackUrl": f"{base}/api/office/callback/{file.id}?token={callback_token}",
            "user": {"id": user.id, "name": user.full_name},
            "customization": {
                "autosave": True,
                "forcesave": False,
                "compactHeader": True,
                "hideRightMenu": False,
                "help": False,
                "uiTheme": "theme-light",
            },
        },
    }
    config["token"] = office_jwt.sign_config(config)
    return config


def prepare_editor(db, file_id: str, user: User, version_id: str | None = None) -> dict:
    require_enabled()
    file = forms.get_file(db, file_id)
    if file.kind not in documents.OFFICE_KINDS:
        raise AppError(
            415,
            "يمكن تحرير ملفات Word وExcel فقط عبر المحرّر.",
            "OFFICE_FORMAT_UNSUPPORTED",
        )
    if not file.current_version_id:
        raise NotFoundError("لا يوجد إصدار حالي للمستند.", code="OFFICE_VERSION_NOT_FOUND")
    version = versions.get_version(db, file, version_id or file.current_version_id)
    if version.extension.lower() in {"doc", "xls"}:
        raise AppError(
            422,
            "الملف بصيغة قديمة ويحتاج إلى تحويل قبل التحرير.",
            "OFFICE_LEGACY_NOT_CONVERTED",
        )

    session = sessions.open_session(db, file, version, user)
    return {
        "documentServerUrl": "/onlyoffice",
        "session": {
            "id": session.id,
            "expiresAt": sessions.as_utc(session.expires_at),
        },
        "version": {
            "id": version.id,
            "number": version.version_no,
            "extension": version.extension,
            "isOriginal": version.is_original,
            "checksum": version.checksum,
        },
        "config": build_config(file, version, session, user),
    }


def version_out(db, version: FormFileVersion) -> dict:
    actor = db.get(User, version.created_by) if version.created_by else None
    return {
        "id": version.id,
        "number": version.version_no,
        "source": version.source,
        "isOriginal": version.is_original,
        "extension": version.extension,
        "sizeBytes": version.size_bytes,
        "checksum": version.checksum,
        "createdAt": sessions.as_utc(version.created_at),
        "createdBy": version.created_by,
        "createdByName": actor.full_name if actor else None,
        "pdfStatus": version.pdf_status,
        "parentVersionId": version.parent_version_id,
    }


def version_download_target(file: FormFile, version: FormFileVersion) -> tuple[Path, str, str]:
    path = documents.resolve_storage_path(version.storage_path)
    if not path.exists():
        raise NotFoundError("ملف هذا الإصدار مفقود من التخزين.", code="OFFICE_VERSION_CONTENT_MISSING")
    name = f"{Path(file.original_name).stem}_v{version.version_no}.{version.extension}"
    return path, name, version.mime


def version_preview_target(file: FormFile, version: FormFileVersion) -> tuple[Path, str]:
    relative = version.pdf_path if version.pdf_status == "ready" else None
    if not relative:
        relative = file.converted_pdf_path
    if not relative:
        raise NotFoundError("معاينة هذا الإصدار غير جاهزة بعد.", code="PREVIEW_NOT_READY")
    path = documents.resolve_storage_path(relative)
    if not path.exists():
        raise NotFoundError("معاينة هذا الإصدار غير جاهزة بعد.", code="PREVIEW_NOT_READY")
    return path, f"{Path(file.original_name).stem}_v{version.version_no}.pdf"


def convert_legacy_version(db, file: FormFile, actor: User) -> FormFileVersion:
    """Retry a legacy .doc/.xls conversion, producing a new current version."""
    if file.kind not in documents.OFFICE_KINDS:
        raise AppError(
            415,
            "يمكن تحويل ملفات Word وExcel فقط.",
            "OFFICE_FORMAT_UNSUPPORTED",
        )
    if not file.current_version_id:
        raise NotFoundError("لا يوجد إصدار حالي للمستند.", code="OFFICE_VERSION_NOT_FOUND")
    current = versions.get_version(db, file, file.current_version_id)
    if current.extension.lower() not in {"doc", "xls"}:
        raise AppError(409, "الملف مُحوّل بالفعل إلى صيغة حديثة.", "OFFICE_ALREADY_OOXML")

    data = documents.convert_legacy(documents.resolve_storage_path(current.storage_path))
    new_extension = "docx" if file.kind == "word" else "xlsx"
    new_mime = documents.DOCX_MIME if file.kind == "word" else documents.XLSX_MIME
    converted = versions.create_version(
        db,
        file,
        data=data,
        kind=file.kind,
        extension=new_extension,
        mime=new_mime,
        source="conversion",
        parent_id=current.id,
        actor=actor,
    )
    record_audit(
        db,
        actor=actor,
        action="office.convert",
        entity="form_file",
        entity_id=file.id,
        after={"version_id": converted.id, "number": converted.version_no},
    )
    db.commit()
    documents.render_pdf_for_version(db, file, converted)
    return converted


def close_active_session(db, file_id: str, reason: str, actor: User) -> None:
    active = sessions.get_active_session(db, file_id)
    if active is not None:
        sessions.close_session(db, active, reason, actor=actor)
