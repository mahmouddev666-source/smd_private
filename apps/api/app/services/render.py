"""T3-14: immutable PDF snapshots for form submissions.

The background PDF is a *read-only* version preview. Field values are drawn on
a separate reportlab overlay and merged with pypdf, so the original PDF is
never modified. Arabic text is reshaped/bidirectional and drawn with the same
Cairo font family as the UI.

Rendering only writes a file; it never changes DB state and never raises a
bare FastAPI error. The caller (forms service / worker) converts failure into
``snapshot_status=failed`` without losing the submission.
"""

from __future__ import annotations

import hashlib
import io
import os
import uuid
from pathlib import Path
from typing import Any

import arabic_reshaper
from bidi.algorithm import get_display
from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from sqlalchemy.orm import Session

from app.models.form import FormFile, FormFileVersion, FormSubmission, FormTemplate
from app.services import documents

FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"
FONT_REGULAR = FONT_DIR / "Cairo-Regular.ttf"
FONT_BOLD = FONT_DIR / "Cairo-Bold.ttf"
FONT_REGULAR_NAME = "Cairo"
FONT_BOLD_NAME = "Cairo-Bold"
# Field font sizes in the UI are px on an A4-width (794px) canvas.
A4_WIDTH_PX = 794.0
BOX_PADDING = 2.0
ELLIPSIS = "..."


class SnapshotRenderError(Exception):
    """Identified, non-fatal render failure with a short Arabic message."""

    def __init__(self, message: str, code: str = "SNAPSHOT_RENDER_FAILED"):
        super().__init__(message)
        self.message = message
        self.code = code


def _register_fonts() -> None:
    for name, path in ((FONT_REGULAR_NAME, FONT_REGULAR), (FONT_BOLD_NAME, FONT_BOLD)):
        if not path.is_file():
            raise SnapshotRenderError(
                "خط Cairo المطلوب لتوليد اللقطة مفقود على الخادم.",
                "SNAPSHOT_FONT_MISSING",
            )
        if name not in pdfmetrics.getRegisteredFontNames():
            pdfmetrics.registerFont(TTFont(name, str(path)))


def shape_text(value: Any) -> str:
    """Reshape Arabic presentation forms and apply the bidi display order."""
    return get_display(arabic_reshaper.reshape(str(value)))


def map_box(
    field: dict[str, Any], page_width: float, page_height: float
) -> tuple[float, float, float, float]:
    """Convert UI x/y (%, top-left) to a PDF box (points, bottom-left)."""
    x = float(field["x"]) / 100.0 * page_width
    width = float(field["width"]) / 100.0 * page_width
    height = float(field["height"]) / 100.0 * page_height
    y_bottom = page_height - (float(field["y"]) + float(field["height"])) / 100.0 * page_height
    return x, y_bottom, width, height


def font_size_for(field: dict[str, Any], page_width: float) -> float:
    """Scale the UI px font size to PDF points for the actual page width."""
    return float(field.get("font_size") or 11) * page_width / A4_WIDTH_PX


def _fit_text(text: str, font: str, size: float, max_width: float) -> str:
    if max_width <= 0 or pdfmetrics.stringWidth(text, font, size) <= max_width:
        return text
    clipped = text
    while clipped and pdfmetrics.stringWidth(clipped + ELLIPSIS, font, size) > max_width:
        clipped = clipped[:-1]
    return (clipped + ELLIPSIS) if clipped else ELLIPSIS


def _draw_field(
    pdf: canvas.Canvas,
    field: dict[str, Any],
    value: Any,
    page_width: float,
    page_height: float,
) -> None:
    x, y_bottom, width, height = map_box(field, page_width, page_height)
    if width <= 0 or height <= 0:
        return

    bold = str(field.get("font_weight") or "normal") == "bold"
    font = FONT_BOLD_NAME if bold else FONT_REGULAR_NAME
    size = font_size_for(field, page_width)
    text = _fit_text(shape_text(value), font, size, width - 2 * BOX_PADDING)
    if not text.strip():
        return

    align = str(field.get("align") or "right")
    baseline = y_bottom + (height - size) / 2.0
    baseline = min(max(baseline, y_bottom + BOX_PADDING), y_bottom + height - BOX_PADDING)

    pdf.saveState()
    clip = pdf.beginPath()
    clip.rect(x, y_bottom, width, height)
    pdf.clipPath(clip, stroke=0, fill=0)
    pdf.setFont(font, size)
    pdf.setFillColor(HexColor(str(field.get("color") or "#000000")))
    if align == "left":
        pdf.drawString(x + BOX_PADDING, baseline, text)
    elif align == "center":
        pdf.drawCentredString(x + width / 2.0, baseline, text)
    else:
        pdf.drawRightString(x + width - BOX_PADDING, baseline, text)
    pdf.restoreState()


def _wrap_image(source: Path) -> bytes:
    """Place an image version on an A4 page so it can be used as a background."""
    buffer = io.BytesIO()
    image = ImageReader(str(source))
    image_width, image_height = image.getSize()
    if image_width <= 0 or image_height <= 0:
        raise SnapshotRenderError("صورة المستند غير صالحة.", "SNAPSHOT_BACKGROUND_INVALID")
    scale = min(A4[0] / image_width, A4[1] / image_height)
    width, height = image_width * scale, image_height * scale
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.drawImage(
        image,
        (A4[0] - width) / 2.0,
        (A4[1] - height) / 2.0,
        width=width,
        height=height,
    )
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _load_background(version: FormFileVersion) -> PdfReader:
    if version.kind == "image":
        source = documents.resolve_storage_path(version.storage_path)
        if not source.is_file():
            raise SnapshotRenderError("صورة المستند مفقودة من التخزين.", "SNAPSHOT_BACKGROUND_MISSING")
        return PdfReader(io.BytesIO(_wrap_image(source)))

    if version.pdf_status != "ready" or not version.pdf_path:
        raise SnapshotRenderError(
            "معاينة PDF لهذا الإصدار غير جاهزة بعد.", "SNAPSHOT_BACKGROUND_NOT_READY"
        )
    source = documents.resolve_storage_path(version.pdf_path)
    if not source.is_file():
        raise SnapshotRenderError("ملف معاينة الإصدار مفقود من التخزين.", "SNAPSHOT_BACKGROUND_MISSING")
    return PdfReader(io.BytesIO(source.read_bytes()))


def _build_overlay(
    pages: list[tuple[float, float]],
    fields: list[dict[str, Any]],
    values: dict[str, Any],
) -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=pages[0] if pages else A4)
    for index, (page_width, page_height) in enumerate(pages, start=1):
        if index > 1:
            pdf.setPageSize((page_width, page_height))
        for field in fields:
            if int(field.get("page") or 1) != index:
                continue
            key = str(field.get("key") or "")
            if key not in values or values[key] is None:
                continue
            _draw_field(pdf, field, values[key], page_width, page_height)
        pdf.showPage()
    pdf.save()
    return buffer.getvalue()


def _resolve_version(db: Session, submission: FormSubmission) -> FormFileVersion:
    template = db.get(FormTemplate, submission.template_id)
    if template is None:
        raise SnapshotRenderError("قالب النموذج غير موجود.", "SNAPSHOT_TEMPLATE_MISSING")

    version_id = submission.document_version_id or template.document_version_id
    if not version_id:
        file = db.get(FormFile, template.file_id)
        version_id = file.current_version_id if file else None
    version = db.get(FormFileVersion, version_id) if version_id else None
    if version is None or version.file_id != template.file_id:
        raise SnapshotRenderError(
            "الإصدار المثبّت للنموذج غير موجود.", "SNAPSHOT_VERSION_MISSING"
        )
    return version


def render_snapshot(db: Session, submission: FormSubmission) -> tuple[str, str]:
    """Render one immutable snapshot; return ``(relative_path, sha256)``.

    Raises :class:`SnapshotRenderError` for every expected failure so callers
    can keep the submission and record a friendly status.
    """
    temp_path: Path | None = None
    try:
        _register_fonts()
        version = _resolve_version(db, submission)
        template = db.get(FormTemplate, submission.template_id)
        background = _load_background(version)
        pages = [
            (float(page.mediabox.width), float(page.mediabox.height))
            for page in background.pages
        ]
        if not pages:
            raise SnapshotRenderError("ملف PDF الخلفية فارغ.", "SNAPSHOT_BACKGROUND_INVALID")

        overlay = PdfReader(
            io.BytesIO(_build_overlay(pages, template.fields or [], submission.values or {}))
        )
        writer = PdfWriter()
        for page in background.pages:
            writer.add_page(page)
        for index, page in enumerate(writer.pages):
            if index < len(overlay.pages):
                page.merge_page(overlay.pages[index])
        output = io.BytesIO()
        writer.write(output)
        data = output.getvalue()
        if not data.startswith(b"%PDF-"):
            raise SnapshotRenderError("ملف اللقطة الناتج ليس PDF صالحًا.", "SNAPSHOT_OUTPUT_INVALID")

        relative = f"forms/{version.file_id}/submissions/{submission.id}.pdf"
        target = documents.resolve_storage_path(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        temp_path = target.with_name(f"{target.name}.{uuid.uuid4().hex[:8]}.tmp")
        temp_path.write_bytes(data)
        os.replace(temp_path, target)
        temp_path = None
        return relative, hashlib.sha256(data).hexdigest()
    except SnapshotRenderError:
        raise
    except Exception as exc:  # noqa: BLE001 - callers need an identified failure
        raise SnapshotRenderError(
            "تعذّر توليد لقطة PDF لهذا الطلب. سيُعاد المحاولة لاحقًا.",
            "SNAPSHOT_RENDER_FAILED",
        ) from exc
    finally:
        if temp_path is not None:
            temp_path.unlink(missing_ok=True)
