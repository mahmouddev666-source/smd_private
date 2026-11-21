"""T3-05: immutable document versions with atomic file/DB writes.

The current version is tracked on ``form_files.current_version_id`` (no FK on
purpose — see the model docstring). This service is the only writer of that
column and of ``form_file_versions``.
"""

from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.models.form import FormFile, FormFileVersion
from app.models.user import User
from app.services import documents
from app.services.audit import record_audit
from app.utils.ids import new_id


def checksum_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _normalize_extension(extension: str) -> str:
    ext = (extension or "").strip().lstrip(".")
    if not ext:
        raise ValueError("extension is required")
    return ext


def next_version_no(db: Session, file: FormFile) -> int:
    """Return the next gap-free version number inside a DB transaction.

    ``with_for_update`` locks the parent row on PostgreSQL; it is a safe no-op
    on SQLite. The ``UNIQUE(file_id, version_no)`` constraint is the final
    guard against concurrent writers.
    """
    if db.get(FormFile, file.id, with_for_update=True) is None:
        raise NotFoundError("ملف المستند غير موجود.", code="FORM_FILE_NOT_FOUND")
    highest = db.scalar(
        select(func.coalesce(func.max(FormFileVersion.version_no), 0)).where(
            FormFileVersion.file_id == file.id
        )
    )
    return int(highest or 0) + 1


def is_duplicate_of_current(db: Session, file: FormFile, checksum: str) -> bool:
    """Deduplicate against the *current* version only.

    A later restore may legitimately reintroduce the checksum of an older
    version; that must still create a new version.
    """
    if not file.current_version_id:
        return False
    current = db.get(FormFileVersion, file.current_version_id)
    return bool(current is not None and current.checksum == checksum)


def get_version(db: Session, file: FormFile, version_id: str) -> FormFileVersion:
    version = db.get(FormFileVersion, version_id)
    if version is None or version.file_id != file.id:
        raise NotFoundError("إصدار المستند غير موجود.", code="OFFICE_VERSION_NOT_FOUND")
    return version


def list_versions(db: Session, file: FormFile) -> list[FormFileVersion]:
    return list(
        db.scalars(
            select(FormFileVersion)
            .where(FormFileVersion.file_id == file.id)
            .order_by(FormFileVersion.version_no)
        ).all()
    )


def create_version(
    db: Session,
    file: FormFile,
    *,
    data: bytes,
    kind: str,
    extension: str,
    mime: str,
    source: str,
    parent_id: str | None = None,
    actor: User | None = None,
    is_original: bool = False,
    pdf_path: str | None = None,
    pdf_status: str = "none",
) -> FormFileVersion:
    """Write bytes atomically, insert one version row and advance the file.

    Any failure rolls the DB back and removes the written file, so neither an
    orphan file nor a dangling version row is left behind. Existing files are
    never overwritten.
    """
    if not data:
        raise ValueError("version data must not be empty")
    ext = _normalize_extension(extension)
    checksum = checksum_of(data)
    version_no = next_version_no(db, file)
    relative = f"forms/{file.id}/v{version_no}_{checksum[:8]}.{ext}"

    target: Path = documents.resolve_storage_path(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        # Defensive: version_no + checksum make this practically unreachable.
        raise ConflictError("ملف هذا الإصدار موجود بالفعل.", code="OFFICE_VERSION_FILE_EXISTS")

    temp = target.with_name(f"{target.name}.{uuid.uuid4().hex[:8]}.tmp")
    temp.write_bytes(data)
    os.replace(temp, target)  # atomic rename; no partial file is ever visible

    version = FormFileVersion(
        id=new_id(),
        file_id=file.id,
        version_no=version_no,
        parent_version_id=parent_id,
        storage_path=relative,
        pdf_path=pdf_path,
        pdf_status=pdf_status,
        checksum=checksum,
        size_bytes=len(data),
        mime=mime,
        extension=ext,
        kind=kind,
        source=source,
        is_original=is_original,
        created_by=actor.id if actor else None,
        is_demo=bool(file.is_demo),
    )

    try:
        db.add(version)
        db.flush()

        # Compatibility columns must keep pointing at the current version.
        file.current_version_id = version.id
        file.size_bytes = len(data)
        file.checksum = checksum
        file.mime = mime
        if pdf_path is not None:
            file.converted_pdf_path = pdf_path

        record_audit(
            db,
            actor=actor,
            action="office.version.create",
            entity="form_file_version",
            entity_id=version.id,
            after={
                "file_id": file.id,
                "version_no": version_no,
                "source": source,
                "is_original": is_original,
            },
        )
        db.commit()
    except Exception:
        db.rollback()
        target.unlink(missing_ok=True)
        raise

    db.refresh(version)
    return version


def set_pdf_state(
    db: Session,
    version: FormFileVersion,
    *,
    pdf_path: str | None,
    pdf_status: str,
) -> None:
    """Persist the PDF preview state of a version (called by the renderer)."""
    version.pdf_path = pdf_path
    version.pdf_status = pdf_status
    db.commit()
