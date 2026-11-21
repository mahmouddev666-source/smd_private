"""File storage, magic-byte validation and LibreOffice→PDF conversion.

Company documents are stored outside the web root and served only through an
authenticated endpoint. Word/Excel files keep their original copy and gain a
PDF copy used for preview/printing (`soffice --headless`).
"""

from __future__ import annotations

import hashlib
import io
import os
import re
import subprocess
import tempfile
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import UploadFile

from app.core.config import settings
from app.core.errors import AppError, ValidationError

MAGIC_PDF = b"%PDF-"
MAGIC_PNG = b"\x89PNG\r\n\x1a\n"
MAGIC_JPEG = b"\xff\xd8\xff"
MAGIC_ZIP = b"PK\x03\x04"
MAGIC_OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
DOC_MIME = "application/msword"
XLS_MIME = "application/vnd.ms-excel"

# mime -> (extension, kind)
SUPPORTED: dict[str, tuple[str, str]] = {
    "application/pdf": (".pdf", "pdf"),
    "image/png": (".png", "image"),
    "image/jpeg": (".jpg", "image"),
    DOCX_MIME: (".docx", "word"),
    XLSX_MIME: (".xlsx", "excel"),
    DOC_MIME: (".doc", "word"),
    XLS_MIME: (".xls", "excel"),
}
OFFICE_KINDS = {"word", "excel"}

_UNSAFE_NAME = re.compile(r'[\x00-\x1f<>:"/\\|?*]')


@dataclass(frozen=True)
class StoredDocument:
    storage_path: str  # relative to settings.storage_dir (POSIX separators)
    converted_pdf_path: str | None
    mime: str
    kind: str
    size_bytes: int
    checksum: str
    page_count: int


def max_upload_bytes() -> int:
    return max(1, settings.max_upload_mb) * 1024 * 1024


def sanitize_filename(name: str | None) -> str:
    raw = (name or "document").replace("\\", "/").split("/")[-1].strip()
    clean = _UNSAFE_NAME.sub("_", raw).strip(" .")
    return clean[:255] or "document"


def read_upload(upload: UploadFile) -> bytes:
    """Read at most `MAX_UPLOAD_MB + 1` bytes so an oversized file is rejected
    before it is loaded into memory."""
    limit = max_upload_bytes()
    data = upload.file.read(limit + 1)
    if not data:
        raise ValidationError("الملف فارغ.", code="EMPTY_FILE")
    if len(data) > limit:
        raise AppError(
            413,
            f"حجم الملف يتجاوز الحد المسموح ({settings.max_upload_mb} ميجابايت).",
            "FILE_TOO_LARGE",
        )
    return data


def detect_mime(filename: str, data: bytes) -> str:
    """Detect the real type from magic bytes, never from the extension alone."""
    head = data[:4096]
    if MAGIC_PDF in head:
        return "application/pdf"
    if data.startswith(MAGIC_PNG):
        return "image/png"
    if data.startswith(MAGIC_JPEG):
        return "image/jpeg"
    if data.startswith(MAGIC_ZIP):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                names = set(archive.namelist())
        except zipfile.BadZipFile as exc:
            raise ValidationError("ملف مضغوط تالف أو غير صالح.", code="INVALID_ARCHIVE") from exc
        if any(name.startswith("word/") for name in names):
            return DOCX_MIME
        if any(name.startswith("xl/") for name in names):
            return XLSX_MIME
        raise ValidationError(
            "نوع ملف Office غير مدعوم. المسموح: Word أو Excel.", code="UNSUPPORTED_FILE_TYPE"
        )
    if data.startswith(MAGIC_OLE):
        suffix = Path(filename).suffix.lower()
        if suffix == ".doc":
            return DOC_MIME
        if suffix == ".xls":
            return XLS_MIME
        raise ValidationError(
            "ملف Office قديم غير معروف. يرجى استخدام .doc أو .xls.", code="UNSUPPORTED_FILE_TYPE"
        )
    raise ValidationError(
        "نوع الملف غير مدعوم. المسموح: PDF، Word، Excel، PNG، JPEG.",
        code="UNSUPPORTED_FILE_TYPE",
    )


def _storage_root() -> Path:
    root = Path(settings.storage_dir).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    return root


def resolve_storage_path(relative: str) -> Path:
    """Resolve a DB path and refuse anything that escapes the storage root."""
    root = _storage_root()
    candidate = (root / relative).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValidationError("مسار الملف غير صالح.", code="INVALID_STORAGE_PATH")
    return candidate


def store_document(filename: str, data: bytes) -> StoredDocument:
    mime = detect_mime(filename, data)
    extension, kind = SUPPORTED[mime]

    root = _storage_root()
    target = root / "forms" / f"{uuid.uuid4().hex}{extension}"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    relative = target.relative_to(root).as_posix()

    converted_path: Path | None = None
    converted_relative: str | None = None
    if kind in OFFICE_KINDS:
        converted_path = convert_to_pdf(target)
        converted_relative = converted_path.relative_to(root).as_posix()

    if mime == "application/pdf":
        page_count = count_pdf_pages(target)
    elif converted_path is not None:
        page_count = count_pdf_pages(converted_path)
    else:
        page_count = 1

    return StoredDocument(
        storage_path=relative,
        converted_pdf_path=converted_relative,
        mime=mime,
        kind=kind,
        size_bytes=len(data),
        checksum=hashlib.sha256(data).hexdigest(),
        page_count=max(1, page_count),
    )


def convert_to_pdf(source: Path) -> Path:
    """Convert a Word/Excel file with LibreOffice headless. Raises a clear
    Arabic error when the converter is unavailable or fails."""
    outdir = source.parent / "pdf"
    outdir.mkdir(parents=True, exist_ok=True)
    profile = outdir / f"lo-profile-{uuid.uuid4().hex[:8]}"

    command = [
        settings.libreoffice_bin,
        "--headless",
        "--norestore",
        f"-env:UserInstallation={profile.resolve().as_uri()}",
        "--convert-to",
        "pdf",
        "--outdir",
        str(outdir),
        str(source),
    ]

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            timeout=settings.libreoffice_timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        raise AppError(
            503,
            "خدمة تحويل المستندات (LibreOffice) غير متاحة على الخادم.",
            "CONVERTER_UNAVAILABLE",
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise AppError(
            422,
            "استغرق تحويل المستند وقتًا أطول من المسموح. حاول مرة أخرى.",
            "DOCUMENT_CONVERSION_TIMEOUT",
        ) from exc

    expected = outdir / f"{source.stem}.pdf"
    if completed.returncode != 0 or not expected.exists():
        raise AppError(
            422,
            "تعذّر تحويل المستند إلى PDF. تأكد من أن الملف سليم وغير محمي بكلمة مرور.",
            "DOCUMENT_CONVERSION_FAILED",
        )

    return expected


def count_pdf_pages(path: Path) -> int:
    """Best-effort page count without extra dependencies."""
    try:
        data = path.read_bytes()
    except OSError:
        return 1

    pages = len(re.findall(rb"/Type\s*/Page(?![a-zA-Z])", data))
    if pages:
        return pages
    counts = [int(value) for value in re.findall(rb"/Count\s+(\d+)", data)]
    if counts:
        return max(counts)
    return 1


# ---------------------------------------------------------------------------
# T3-06: OOXML validation, legacy conversion, per-version PDF previews
# ---------------------------------------------------------------------------


def validate_ooxml(data: bytes, kind: str) -> None:
    """Reject OLE/HTML/JSON/non-OOXML ZIPs before they become a new version."""
    error = lambda: ValidationError(
        "محتوى المستند ليس ملف Word/Excel حديثًا صالحًا (.docx/.xlsx).",
        code="OFFICE_CONTENT_TYPE_MISMATCH",
    )
    if not data:
        raise error()
    if data.startswith(MAGIC_OLE):
        # A failed legacy conversion usually leaves an OLE container.
        raise error()
    head = data[:1024].lstrip().lower()
    if head.startswith((b"<", b"{", b"[")) or b"<html" in head or b"<!doctype" in head:
        raise error()
    if not data.startswith(MAGIC_ZIP):
        raise error()
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            names = set(archive.namelist())
    except zipfile.BadZipFile as exc:
        raise ValidationError("ملف Office تالف أو غير مكتمل.", code="INVALID_ARCHIVE") from exc
    if "[Content_Types].xml" not in names:
        raise error()
    expected_prefix = {"word": "word/", "excel": "xl/"}.get(kind)
    if expected_prefix and not any(name.startswith(expected_prefix) for name in names):
        raise error()


def convert_legacy(source: Path) -> bytes:
    """Convert a legacy ``.doc``/``.xls`` file to OOXML bytes via LibreOffice."""
    suffix = source.suffix.lower()
    if suffix == ".doc":
        kind, target_format, target_ext = "word", "docx", "docx"
    elif suffix == ".xls":
        kind, target_format, target_ext = "excel", "xlsx", "xlsx"
    else:
        raise ValidationError(
            "ملف Office قديم غير معروف. يرجى استخدام .doc أو .xls.",
            code="OFFICE_LEGACY_NOT_CONVERTED",
        )

    with tempfile.TemporaryDirectory(prefix="smd-office-legacy-") as temp_dir:
        outdir = Path(temp_dir)
        profile = outdir / "lo-profile"
        command = [
            settings.libreoffice_bin,
            "--headless",
            "--norestore",
            f"-env:UserInstallation={profile.resolve().as_uri()}",
            "--convert-to",
            target_format,
            "--outdir",
            str(outdir),
            str(source),
        ]
        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                timeout=settings.libreoffice_timeout_seconds,
                check=False,
            )
        except FileNotFoundError as exc:
            raise AppError(
                422,
                "تعذّر تحويل الملف القديم: خدمة LibreOffice غير متاحة على الخادم.",
                "OFFICE_CONVERSION_FAILED",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise AppError(
                422,
                "استغرق تحويل الملف القديم وقتًا أطول من المسموح. حاول مرة أخرى.",
                "OFFICE_CONVERSION_FAILED",
            ) from exc

        expected = outdir / f"{source.stem}.{target_ext}"
        if completed.returncode != 0 or not expected.exists():
            raise AppError(
                422,
                "تعذّر تحويل الملف القديم إلى صيغة حديثة. تأكد من أن الملف سليم.",
                "OFFICE_CONVERSION_FAILED",
            )
        data = expected.read_bytes()

    validate_ooxml(data, kind)
    if len(data) > max_upload_bytes():
        raise AppError(
            413,
            f"حجم الملف المحوّل يتجاوز الحد المسموح ({settings.max_upload_mb} ميجابايت).",
            "FILE_TOO_LARGE",
        )
    return data


def render_pdf_for_version(db, file, version, *, pdf_source: Path | None = None) -> bool:
    """Render a preview PDF for one immutable version.

    A rendering failure must never delete the version: it only flips
    ``pdf_status`` to ``failed`` so the worker/UI can retry.
    """
    from app.services.audit import record_audit

    try:
        if pdf_source is None:
            source = resolve_storage_path(version.storage_path)
            if not source.exists():
                raise AppError(422, "ملف الإصدار مفقود من التخزين.", "OFFICE_VERSION_FILE_MISSING")
            pdf_source = convert_to_pdf(source)

        data = Path(pdf_source).read_bytes()
        if not data.startswith(MAGIC_PDF):
            raise AppError(422, "ملف المعاينة الناتج ليس PDF صالحًا.", "OFFICE_PDF_INVALID")

        relative = f"forms/{file.id}/pdf/v{version.version_no}.pdf"
        target = resolve_storage_path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        temp = target.with_name(f"{target.name}.{uuid.uuid4().hex[:8]}.tmp")
        temp.write_bytes(data)
        os.replace(temp, target)

        version.pdf_path = relative
        version.pdf_status = "ready"
        file.converted_pdf_path = relative
        record_audit(
            db,
            actor=None,
            action="office.pdf.ready",
            entity="form_file_version",
            entity_id=version.id,
            after={"version_no": version.version_no},
        )
        db.commit()
        return True
    except Exception as exc:  # noqa: BLE001 - preview is best-effort by design
        db.rollback()
        version.pdf_path = None
        version.pdf_status = "failed"
        try:
            record_audit(
                db,
                actor=None,
                action="office.pdf.failed",
                entity="form_file_version",
                entity_id=version.id,
                after={"version_no": version.version_no, "reason": type(exc).__name__},
            )
            db.commit()
        except Exception:  # noqa: BLE001 - never lose the version over an audit
            db.rollback()
        return False
