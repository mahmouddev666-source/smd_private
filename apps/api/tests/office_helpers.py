"""Shared fixtures for /api/office/* tests (test helpers, not production)."""

import io
import zipfile
from pathlib import Path

import pytest

from app.core.config import settings
from app.models.form import FormFile, FormFileVersion
from app.models.user import User
from app.services import documents, office as office_service, sessions, versions
from app.utils.ids import new_id

DS_SECRET = "ds-test-secret-" + "x" * 20
OFFICE_SECRET = "office-test-secret-" + "x" * 20


def docx_bytes(marker: bytes = b"base") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", f"<w:document>{marker.decode()}</w:document>")
    return buffer.getvalue()


def valid_pdf_bytes(text: str = "SMD-HR") -> bytes:
    """A well-formed PDF for pypdf/readers (the ad-hoc MINIMAL_PDF is not)."""
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer)
    pdf.drawString(72, 720, text)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


@pytest.fixture()
def office_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "onlyoffice_enabled", True)
    monkeypatch.setattr(settings, "onlyoffice_jwt_secret", DS_SECRET)
    monkeypatch.setattr(settings, "office_token_secret", OFFICE_SECRET)
    monkeypatch.setattr(settings, "onlyoffice_internal_host", "onlyoffice")
    monkeypatch.setattr(settings, "onlyoffice_internal_url", "http://onlyoffice")
    monkeypatch.setattr(settings, "onlyoffice_callback_base", "http://api:8000")
    monkeypatch.setattr(settings, "office_require_ds_download_token", True)
    monkeypatch.setattr(settings, "office_session_ttl_minutes", 60)
    monkeypatch.setattr(office_service, "_health_cache", None)


@pytest.fixture(autouse=True)
def office_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def make_file(
    db,
    *,
    kind: str = "word",
    extension: str = "docx",
    data: bytes | None = None,
    pdf: bool = False,
) -> tuple[FormFile, FormFileVersion]:
    """Create a FormFile + immutable v1 directly in the test DB."""
    mime = {
        ("word", "docx"): documents.DOCX_MIME,
        ("word", "doc"): documents.DOC_MIME,
        ("excel", "xlsx"): documents.XLSX_MIME,
        ("excel", "xls"): documents.XLS_MIME,
        ("pdf", "pdf"): "application/pdf",
        ("image", "png"): "image/png",
    }[(kind, extension)]
    content = data or (docx_bytes() if kind == "word" else b"%PDF-1.4 minimal")
    file = FormFile(
        id=new_id(),
        original_name=f"نموذج.{extension}",
        mime=mime,
        kind=kind,
        size_bytes=0,
        checksum="",
        storage_path="forms/legacy." + extension,
        is_active=True,
        is_demo=False,
    )
    db.add(file)
    db.flush()
    version = versions.create_version(
        db,
        file,
        data=content,
        kind=kind,
        extension=extension,
        mime=mime,
        source="upload",
        is_original=True,
    )
    if pdf:
        documents.render_pdf_for_version(
            db, file, version, pdf_source=_write_pdf(file, version)
        )
    db.refresh(file)
    return file, version


def _write_pdf(file: FormFile, version: FormFileVersion) -> Path:
    path = Path(settings.storage_dir) / "forms" / "seed.pdf"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(valid_pdf_bytes())
    return path


def user(db, username: str) -> User:
    return db.query(User).filter(User.username == username).one()
