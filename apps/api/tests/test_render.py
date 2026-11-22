"""T3-14: Arabic PDF snapshot rendering — merge, shaping, fonts and failures."""

import hashlib
import io
from pathlib import Path

import pytest
from PIL import Image
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.form import FormSubmission, FormTemplate
from app.services import documents, render, versions
from app.utils.ids import new_id
from tests.office_helpers import docx_bytes, make_file


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def _field(key: str, *, align: str = "right", bold: bool = False, page: int = 1) -> dict:
    return {
        "key": key,
        "binding": "employee.name",
        "label": key,
        "page": page,
        "x": 10,
        "y": 20,
        "width": 60,
        "height": 8,
        "font_size": 12,
        "font_weight": "bold" if bold else "normal",
        "align": align,
        "color": "#102040",
    }


def _submission(db: Session, *, kind: str = "word", data: bytes | None = None):
    extension = "png" if kind == "image" else "docx"
    file, version = make_file(
        db, kind=kind, extension=extension, data=data or docx_bytes(), pdf=kind != "image"
    )
    template = FormTemplate(
        id=new_id(),
        name="نموذج الاختبار",
        category="الإجازات",
        description="",
        file_id=file.id,
        fields=[_field("employee_name", bold=True), _field("reference", align="left")],
        created_by=None,
        is_active=True,
        is_demo=False,
        document_version_id=version.id,
    )
    db.add(template)
    submission = FormSubmission(
        id=new_id(),
        template_id=template.id,
        employee_id="9001",
        values={"employee_name": "أحمد محمد", "reference": "MR-9001"},
        status="نهائي",
        created_by=None,
        is_demo=False,
        document_version_id=version.id,
        snapshot_status="pending",
        snapshot_attempts=0,
    )
    db.add(submission)
    db.commit()
    return file, version, submission


def test_render_merges_fields_without_changing_the_source(db: Session) -> None:
    file, version, submission = _submission(db)
    source = documents.resolve_storage_path(version.pdf_path)
    original = source.read_bytes()
    original_checksum = hashlib.sha256(original).hexdigest()

    relative, checksum = render.render_snapshot(db, submission)

    assert relative == f"forms/{file.id}/submissions/{submission.id}.pdf"
    output = documents.resolve_storage_path(relative)
    assert output.is_file() and output.read_bytes().startswith(b"%PDF-")
    assert checksum == hashlib.sha256(output.read_bytes()).hexdigest()
    assert source.read_bytes() == original
    assert original_checksum == hashlib.sha256(original).hexdigest()

    reader = PdfReader(io.BytesIO(output.read_bytes()))
    assert len(reader.pages) == 1
    text = reader.pages[0].extract_text() or ""
    assert "MR-9001" in text  # Latin marker survives bidi + TTF subsetting


def test_shape_text_and_map_box_use_visual_order_and_top_left_coordinates() -> None:
    assert render.shape_text("مرحبا") != "مرحبا"
    # x=10% and y=20% of a 600x800 page -> x=60, top=160, h=64 -> bottom=576.
    assert render.map_box(_field("k"), 600, 800) == pytest.approx((60, 576, 360, 64))
    assert render.font_size_for(_field("k"), 397) == pytest.approx(6, rel=0.01)


def test_missing_font_raises_an_identified_error(db: Session, monkeypatch) -> None:
    _, _, submission = _submission(db)
    monkeypatch.setattr(render, "FONT_REGULAR", Path(settings.storage_dir) / "missing.ttf")
    with pytest.raises(render.SnapshotRenderError) as excinfo:
        render.render_snapshot(db, submission)
    assert excinfo.value.code == "SNAPSHOT_FONT_MISSING"
    assert "Cairo" in excinfo.value.message


def test_unready_background_raises_an_identified_error(db: Session) -> None:
    _, version, submission = _submission(db)
    version.pdf_status = "failed"
    version.pdf_path = None
    db.commit()
    with pytest.raises(render.SnapshotRenderError) as excinfo:
        render.render_snapshot(db, submission)
    assert excinfo.value.code == "SNAPSHOT_BACKGROUND_NOT_READY"


def test_image_background_is_wrapped_into_an_a4_page(db: Session) -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (80, 40), "white").save(buffer, format="PNG")
    _, _, submission = _submission(db, kind="image", data=buffer.getvalue())

    relative, _ = render.render_snapshot(db, submission)
    page = PdfReader(io.BytesIO(documents.resolve_storage_path(relative).read_bytes())).pages[0]
    assert float(page.mediabox.width) == pytest.approx(595.27, rel=0.01)
    assert float(page.mediabox.height) == pytest.approx(841.89, rel=0.01)


def test_arabic_long_text_is_clipped_inside_the_box() -> None:
    font = render.FONT_REGULAR_NAME
    from reportlab.pdfbase import pdfmetrics

    render._register_fonts()
    fitted = render._fit_text("نص طويل جدًا" * 20, font, 12, 40)
    assert fitted.endswith(render.ELLIPSIS)
    assert pdfmetrics.stringWidth(fitted, font, 12) <= 40
