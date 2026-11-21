"""T3-12: DS callback state machine, SSRF-safe fetch and versioning.

Every rejection is rendered as ``{"error": 1, ...}`` (never a bare 5xx) so
Document Server does not retry forever.
"""

from __future__ import annotations

from urllib.parse import urlsplit

import httpx

from app.core.config import settings
from app.core.errors import AppError
from app.models.form import FormFile, FormFileVersion
from app.models.user import User
from app.services import documents, office_jwt, office_tokens, sessions, versions
from app.services.audit import record_audit

# DS callback statuses (see Phase 1 §7.4).
STATUS_TOUCH = 1
STATUS_SAVE = 2
STATUS_SAVE_ERROR = 3
STATUS_NO_CHANGES = 4
STATUS_FORCESAVE = 6
STATUS_FORCESAVE_ERROR = 7

_ALLOWED_PATH_PREFIXES = ("/cache/files/", "/download/")


class CallbackRejected(AppError):
    """An AppError whose body always contains the DS ``error`` flag."""

    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code, detail, code)
        self.detail = {"error": 1, "detail": detail, "code": code}


def _as_rejected(exc: AppError) -> CallbackRejected:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return CallbackRejected(
        exc.status_code,
        str(detail.get("detail") or "تعذّر معالجة إشعار المحرّر."),
        str(detail.get("code") or "OFFICE_CALLBACK_FAILED"),
    )


def validate_download_url(raw: str) -> str:
    """Only allow the internal Document Server over plain HTTP on port 80."""
    try:
        parts = urlsplit(raw)
        hostname = parts.hostname
        port = parts.port
    except ValueError as exc:
        raise CallbackRejected(
            400, "رابط المستند غير صالح.", "OFFICE_CALLBACK_URL_REJECTED"
        ) from exc

    if (
        parts.scheme != "http"
        or hostname != settings.onlyoffice_internal_host
        or parts.username is not None
        or parts.password is not None
        or port not in (None, 80)
        or parts.fragment
        or not parts.path.startswith(_ALLOWED_PATH_PREFIXES)
    ):
        raise CallbackRejected(
            400,
            "رابط تحميل المستند من المحرّر مرفوض لأسباب أمنية.",
            "OFFICE_CALLBACK_URL_REJECTED",
        )
    return raw


def fetch_document(url: str) -> bytes:
    """Stream the DS file with a hard byte cap and no redirect following."""
    limit = max(1, settings.office_max_callback_mb) * 1024 * 1024
    try:
        with httpx.stream("GET", url, follow_redirects=False, timeout=30.0) as response:
            if response.status_code != 200:
                raise CallbackRejected(
                    400,
                    "تعذّر جلب المستند من خدمة التحرير.",
                    "OFFICE_CALLBACK_URL_REJECTED",
                )
            content_length = response.headers.get("content-length", "")
            if content_length.isdigit() and int(content_length) > limit:
                raise CallbackRejected(
                    413,
                    "حجم المستند القادم من المحرّر يتجاوز الحد المسموح.",
                    "OFFICE_CONTENT_TOO_LARGE",
                )
            content_type = response.headers.get("content-type", "").lower()
            if "html" in content_type or "json" in content_type:
                raise CallbackRejected(
                    422,
                    "المستند القادم من المحرّر ليس ملفًا صالحًا.",
                    "OFFICE_CONTENT_TYPE_MISMATCH",
                )
            chunks: list[bytes] = []
            total = 0
            for chunk in response.iter_bytes():
                total += len(chunk)
                if total > limit:
                    raise CallbackRejected(
                        413,
                        "حجم المستند القادم من المحرّر يتجاوز الحد المسموح.",
                        "OFFICE_CONTENT_TOO_LARGE",
                    )
                chunks.append(chunk)
            if total == 0:
                raise CallbackRejected(
                    400,
                    "المستند القادم من المحرّر فارغ.",
                    "OFFICE_CALLBACK_PAYLOAD_INVALID",
                )
            return b"".join(chunks)
    except httpx.HTTPError as exc:
        raise CallbackRejected(
            400,
            "تعذّر جلب المستند من خدمة التحرير.",
            "OFFICE_CALLBACK_URL_REJECTED",
        ) from exc


def _verify_inputs(t2_token: str | None, t3_token: str | None, file_id: str) -> tuple[dict, dict]:
    try:
        claims = office_tokens.verify_token(
            t2_token, audience=office_tokens.AUDIENCE_CALLBACK, file_id=file_id
        )
    except AppError as exc:
        raise _as_rejected(exc) from exc
    try:
        data = office_jwt.verify_callback(t3_token)
    except AppError as exc:
        raise _as_rejected(exc) from exc
    return claims, data


def _resolve_session(db, claims: dict, file_id: str, data: dict, body: dict):
    session = sessions.get_session(db, claims.get("sid"))
    if session is None or session.file_id != file_id:
        raise CallbackRejected(
            400,
            "جلسة التحرير المشار إليها غير موجودة.",
            "OFFICE_CALLBACK_PAYLOAD_INVALID",
        )

    for field in ("status", "url", "key", "filetype"):
        if field in body and field in data and body[field] != data[field]:
            raise CallbackRejected(
                400,
                "بيانات إشعار المحرّر متعارضة.",
                "OFFICE_CALLBACK_PAYLOAD_INVALID",
            )

    expected_key = sessions.document_key(file_id, session.version_id)
    if data.get("key") != expected_key:
        raise CallbackRejected(
            400,
            "مفتاح المستند في الإشعار لا يطابق الجلسة الحالية.",
            "OFFICE_CALLBACK_PAYLOAD_INVALID",
        )
    return session


def _save(db, file: FormFile, session, data: dict, body: dict, status: int) -> dict:
    url = data.get("url")
    if not isinstance(url, str) or not url:
        raise CallbackRejected(
            400,
            "الإشعار لا يحتوي على رابط المستند المحفوظ.",
            "OFFICE_CALLBACK_PAYLOAD_INVALID",
        )
    validate_download_url(url)
    payload = fetch_document(url)

    if file.kind not in documents.OFFICE_KINDS:
        raise CallbackRejected(
            422,
            "نوع المستند لا يدعم الحفظ عبر المحرّر.",
            "OFFICE_CONTENT_TYPE_MISMATCH",
        )
    if len(payload) > max(1, settings.office_max_file_mb) * 1024 * 1024:
        raise CallbackRejected(
            413,
            "حجم المستند يتجاوز الحد المسموح.",
            "OFFICE_CONTENT_TOO_LARGE",
        )

    extension = "docx" if file.kind == "word" else "xlsx"
    reported_type = str(data.get("filetype") or body.get("filetype") or "").lower().lstrip(".")
    if reported_type and reported_type != extension:
        raise CallbackRejected(
            422,
            "صيغة المستند المحفوظ غير متوافقة مع نوع الملف.",
            "OFFICE_CONTENT_TYPE_MISMATCH",
        )
    try:
        documents.validate_ooxml(payload, file.kind)
    except AppError as exc:
        raise _as_rejected(exc) from exc

    checksum = versions.checksum_of(payload)
    actor = db.get(User, session.user_id)
    if versions.is_duplicate_of_current(db, file, checksum):
        record_audit(
            db,
            actor=actor,
            action="office.save.duplicate",
            entity="form_file",
            entity_id=file.id,
            after={"session_id": session.id, "checksum": checksum[:12]},
        )
        sessions.touch_session(db, session)
        return {"error": 0}

    current = db.get(FormFileVersion, file.current_version_id) if file.current_version_id else None
    if current is not None and current.id != session.version_id:
        record_audit(
            db,
            actor=actor,
            action="office.save.conflict_based_on_old_version",
            entity="form_file",
            entity_id=file.id,
            after={
                "session_version_id": session.version_id,
                "current_version_id": current.id,
            },
        )

    mime = documents.DOCX_MIME if file.kind == "word" else documents.XLSX_MIME
    version = versions.create_version(
        db,
        file,
        data=payload,
        kind=file.kind,
        extension=extension,
        mime=mime,
        source="onlyoffice",
        parent_id=session.version_id,
        actor=actor,
    )
    record_audit(
        db,
        actor=actor,
        action="office.save",
        entity="form_file_version",
        entity_id=version.id,
        after={
            "status": status,
            "checksum": checksum[:12],
            "forcesavetype": data.get("forcesavetype") or body.get("forcesavetype"),
        },
    )
    db.commit()
    documents.render_pdf_for_version(db, file, version)

    if status == STATUS_SAVE:
        sessions.close_session(db, session, "saved", actor=actor)
    else:
        sessions.touch_session(db, session)
    return {"error": 0}


def handle_callback(
    db,
    *,
    file_id: str,
    t2_token: str | None,
    t3_token: str | None,
    body: dict,
) -> dict:
    """Run the full callback state machine; caller turns AppError into DS JSON."""
    claims, data = _verify_inputs(t2_token, t3_token, file_id)
    session = _resolve_session(db, claims, file_id, data, body)
    status = data["status"]
    actor = db.get(User, session.user_id)

    if status == STATUS_TOUCH:
        sessions.touch_session(db, session)
        return {"error": 0}

    if status in (STATUS_SAVE, STATUS_FORCESAVE):
        file = db.get(FormFile, file_id)
        if file is None or not file.is_active:
            raise CallbackRejected(404, "ملف المستند غير موجود.", "FORM_FILE_NOT_FOUND")
        return _save(db, file, session, data, body, status)

    if status in (STATUS_SAVE_ERROR, STATUS_FORCESAVE_ERROR):
        record_audit(
            db,
            actor=actor,
            action="office.save.error",
            entity="form_file",
            entity_id=file_id,
            after={"status": status, "reason": data.get("error")},
        )
        if status == STATUS_SAVE_ERROR:
            sessions.close_session(db, session, "saved_with_error", actor=actor)
        else:
            sessions.touch_session(db, session)
        db.commit()
        return {"error": 0}

    # STATUS_NO_CHANGES
    sessions.close_session(db, session, "no_changes", actor=actor)
    return {"error": 0}
