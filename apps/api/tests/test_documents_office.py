"""T3-06: OOXML validation, legacy conversion and per-version PDF previews."""

import io
import zipfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import settings
from app.core.errors import AppError
from app.models.form import FormFile, FormFileVersion
from app.services import documents, versions
from app.utils.ids import new_id

from tests.test_forms import MINIMAL_PDF, _docx_bytes


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def _xlsx_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
    return buffer.getvalue()


def test_validate_ooxml_accepts_docx_and_xlsx() -> None:
    documents.validate_ooxml(_docx_bytes(), "word")
    documents.validate_ooxml(_xlsx_bytes(), "excel")


@pytest.mark.parametrize(
    ("data", "kind"),
    [
        (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1 ole", "word"),
        (b"<html><body>error</body></html>", "word"),
        (b'{"error": "nope"}', "word"),
        (_docx_bytes(), "excel"),  # wrong internal structure
    ],
)
def test_validate_ooxml_rejects_bad_payloads(data: bytes, kind: str) -> None:
    with pytest.raises(AppError) as excinfo:
        documents.validate_ooxml(data, kind)
    assert excinfo.value.status_code == 422
    assert excinfo.value.detail["code"] == "OFFICE_CONTENT_TYPE_MISMATCH"


def test_validate_ooxml_rejects_zip_without_content_types() -> None:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("word/document.xml", "<w:document/>")
    with pytest.raises(AppError):
        documents.validate_ooxml(buffer.getvalue(), "word")


def test_convert_legacy_produces_valid_ooxml_bytes(monkeypatch) -> None:
    def fake_run(command: list[str], **kwargs):
        outdir = Path(command[command.index("--outdir") + 1])
        target_format = command[command.index("--convert-to") + 1]
        source = Path(command[-1])
        output = outdir / f"{source.stem}.{target_format}"
        output.write_bytes(_docx_bytes() if target_format == "docx" else _xlsx_bytes())
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(documents.subprocess, "run", fake_run)
    source = Path(settings.storage_dir) / "forms" / "legacy.doc"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(b"\xd0\xcf\x11\xe0")

    converted = documents.convert_legacy(source)
    assert converted.startswith(b"PK\x03\x04")
    documents.validate_ooxml(converted, "word")


def test_convert_legacy_failure_keeps_a_clear_arabic_error(monkeypatch) -> None:
    monkeypatch.setattr(
        documents.subprocess,
        "run",
        lambda *args, **kwargs: SimpleNamespace(returncode=1),
    )
    source = Path(settings.storage_dir) / "forms" / "legacy.xls"
    source.parent.mkdir(parents=True, exist_ok=True)
    source.write_bytes(b"\xd0\xcf\x11\xe0")

    with pytest.raises(AppError) as excinfo:
        documents.convert_legacy(source)
    assert excinfo.value.status_code == 422
    assert excinfo.value.detail["code"] == "OFFICE_CONVERSION_FAILED"
    assert "تحويل" in excinfo.value.detail["detail"]


def _file_and_version(db):
    file = FormFile(
        id=new_id(),
        original_name="نموذج.docx",
        mime=documents.DOCX_MIME,
        kind="word",
        size_bytes=0,
        checksum="",
        storage_path="forms/old.docx",
        is_active=True,
        is_demo=False,
    )
    db.add(file)
    db.flush()
    version = versions.create_version(
        db,
        file,
        data=_docx_bytes(),
        kind="word",
        extension="docx",
        mime=documents.DOCX_MIME,
        source="upload",
        is_original=True,
    )
    return file, version


def test_render_pdf_for_version_marks_ready(db, monkeypatch) -> None:
    file, version = _file_and_version(db)

    def fake_convert(source: Path) -> Path:
        outdir = source.parent / "pdf"
        outdir.mkdir(parents=True, exist_ok=True)
        output = outdir / f"{source.stem}.pdf"
        output.write_bytes(MINIMAL_PDF)
        return output

    monkeypatch.setattr(documents, "convert_to_pdf", fake_convert)
    assert documents.render_pdf_for_version(db, file, version) is True
    assert version.pdf_status == "ready"
    assert version.pdf_path == f"forms/{file.id}/pdf/v1.pdf"
    assert (Path(settings.storage_dir) / version.pdf_path).exists()


def test_render_pdf_failure_does_not_delete_the_version(db, monkeypatch) -> None:
    file, version = _file_and_version(db)

    def broken_convert(source: Path) -> Path:
        raise AppError(422, "تعذّر التحويل", "DOCUMENT_CONVERSION_FAILED")

    monkeypatch.setattr(documents, "convert_to_pdf", broken_convert)
    assert documents.render_pdf_for_version(db, file, version) is False
    assert version.pdf_status == "failed"
    assert version.pdf_path is None
    assert db.get(FormFileVersion, version.id) is not None
