"""Document engine API tests: upload, conversion, templates, submissions."""

import io
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.services import documents
from tests.conftest import login

MINIMAL_PDF = b"""%PDF-1.4
1 0 obj<</Type /Catalog /Pages 2 0 R>>endobj
2 0 obj<</Type /Pages /Kids[3 0 R 4 0 R] /Count 2>>endobj
3 0 obj<</Type /Page /Parent 2 0 R>>endobj
4 0 obj<</Type /Page /Parent 2 0 R>>endobj
trailer<</Root 1 0 R>>
%%EOF
"""

EMPLOYEE = {
    "employee_id": "9003",
    "name": "م. مروان أشرف الشريف",
    "department": "السلامة والصحة المهنية",
    "current_title": "مهندس سلامة",
    "hire_date": "2021-06-01",
}

FIELDS = [
    {
        "key": "employee_name",
        "binding": "employee.name",
        "label": "اسم الموظف",
        "page": 1,
        "x": 10,
        "y": 20,
        "width": 40,
        "height": 5,
    },
    {
        "key": "start_date",
        "binding": "leave.startDate",
        "label": "تاريخ البدء",
        "page": 1,
        "x": 55,
        "y": 20,
        "width": 20,
        "height": 5,
        "font_weight": "bold",
    },
]


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def _upload(
    client: TestClient,
    headers: dict[str, str],
    *,
    name: str = "نموذج-إجازة.pdf",
    content: bytes = MINIMAL_PDF,
    mime: str = "application/pdf",
):
    return client.post(
        "/api/forms/files",
        files={"file": (name, content, mime)},
        headers=headers,
    )


def _docx_bytes() -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<w:document/>")
    return buffer.getvalue()


def _create_template(client: TestClient, headers: dict[str, str], file_id: str):
    return client.post(
        "/api/forms/templates",
        json={
            "name": "طلب إجازة",
            "category": "الإجازات",
            "description": "نموذج الشركة الأصلي",
            "file_id": file_id,
            "fields": FIELDS,
        },
        headers=headers,
    )


def test_pdf_upload_download_and_page_count(client: TestClient) -> None:
    headers = login(client)
    uploaded = _upload(client, headers)
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["mime"] == "application/pdf"
    assert body["kind"] == "pdf"
    assert body["page_count"] == 2
    assert body["original_name"] == "نموذج-إجازة.pdf"

    listing = client.get("/api/forms/files", headers=headers)
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    download = client.get(f"/api/forms/files/{body['id']}/download", headers=headers)
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/pdf")
    assert "inline" in download.headers["content-disposition"]
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.content.startswith(b"%PDF-")

    anonymous = client.get(f"/api/forms/files/{body['id']}/download")
    assert anonymous.status_code == 401


def test_upload_rejects_spoofed_and_empty_files(client: TestClient) -> None:
    headers = login(client)

    spoofed = _upload(client, headers, name="invoice.pdf", content=b"just text, not a pdf")
    assert spoofed.status_code == 422
    assert spoofed.json()["code"] == "UNSUPPORTED_FILE_TYPE"

    executable = _upload(client, headers, name="tool.pdf", content=b"MZ\x90\x00binary")
    assert executable.status_code == 422
    assert executable.json()["code"] == "UNSUPPORTED_FILE_TYPE"

    empty = _upload(client, headers, name="empty.pdf", content=b"")
    assert empty.status_code == 422
    assert empty.json()["code"] == "EMPTY_FILE"


def test_upload_rejects_oversized_file(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = login(client)
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    oversized = b"%PDF-" + b"0" * (1024 * 1024)
    response = _upload(client, headers, content=oversized)
    assert response.status_code == 413
    assert response.json()["code"] == "FILE_TOO_LARGE"


def test_docx_is_converted_to_pdf(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    headers = login(client)

    def fake_convert(source: Path) -> Path:
        outdir = source.parent / "pdf"
        outdir.mkdir(parents=True, exist_ok=True)
        output = outdir / f"{source.stem}.pdf"
        output.write_bytes(MINIMAL_PDF)
        return output

    monkeypatch.setattr(documents, "convert_to_pdf", fake_convert)

    uploaded = _upload(
        client,
        headers,
        name="نموذج.docx",
        content=_docx_bytes(),
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["kind"] == "word"
    assert body["page_count"] == 2

    download = client.get(f"/api/forms/files/{body['id']}/download", headers=headers)
    assert download.status_code == 200
    assert download.headers["content-type"].startswith("application/pdf")


def test_template_crud_and_validation(client: TestClient) -> None:
    headers = login(client)
    file_id = _upload(client, headers).json()["id"]

    created = _create_template(client, headers, file_id)
    assert created.status_code == 201, created.text
    template = created.json()
    assert template["name"] == "طلب إجازة"
    assert len(template["fields"]) == 2
    assert template["fields"][1]["font_weight"] == "bold"

    duplicate_keys = client.post(
        "/api/forms/templates",
        json={
            "name": "قالب مكرر",
            "file_id": file_id,
            "fields": [FIELDS[0], FIELDS[0]],
        },
        headers=headers,
    )
    assert duplicate_keys.status_code == 422

    out_of_bounds = client.patch(
        f"/api/forms/templates/{template['id']}",
        json={"fields": [dict(FIELDS[0], x=90, width=30)]},
        headers=headers,
    )
    assert out_of_bounds.status_code == 422

    bad_binding = client.patch(
        f"/api/forms/templates/{template['id']}",
        json={"fields": [dict(FIELDS[0], binding="9invalid")]},
        headers=headers,
    )
    assert bad_binding.status_code == 422

    updated = client.patch(
        f"/api/forms/templates/{template['id']}",
        json={"name": "طلب إجازة معتمد", "fields": [dict(FIELDS[0], x=12)]},
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "طلب إجازة معتمد"
    assert updated.json()["fields"][0]["x"] == 12

    search = client.get("/api/forms/templates", params={"search": "معتمد"}, headers=headers)
    assert search.json()["total"] == 1

    missing_file = client.post(
        "/api/forms/templates",
        json={"name": "قالب بلا ملف", "file_id": "does-not-exist", "fields": []},
        headers=headers,
    )
    assert missing_file.status_code == 404
    assert missing_file.json()["code"] == "FORM_FILE_NOT_FOUND"


def test_viewer_can_read_but_not_write_documents(client: TestClient) -> None:
    admin = login(client)
    file_id = _upload(client, admin).json()["id"]

    viewer = login(client, "viewer")
    assert client.get("/api/forms/files", headers=viewer).status_code == 200

    denied_upload = _upload(client, viewer)
    assert denied_upload.status_code == 403

    denied_template = _create_template(client, viewer, file_id)
    assert denied_template.status_code == 403


def test_file_delete_is_blocked_while_used_and_templates_are_soft_deleted(
    client: TestClient,
) -> None:
    headers = login(client)
    file_id = _upload(client, headers).json()["id"]
    template = _create_template(client, headers, file_id).json()

    blocked = client.delete(f"/api/forms/files/{file_id}", headers=headers)
    assert blocked.status_code == 409
    assert blocked.json()["code"] == "FORM_FILE_IN_USE"

    assert client.delete(f"/api/forms/templates/{template['id']}", headers=headers).status_code == 204
    assert client.get("/api/forms/templates", headers=headers).json()["total"] == 0

    assert client.delete(f"/api/forms/files/{file_id}", headers=headers).status_code == 204
    assert client.get("/api/forms/files", headers=headers).json()["total"] == 0
    assert client.get(f"/api/forms/files/{file_id}", headers=headers).status_code == 404


def test_submission_flow(client: TestClient) -> None:
    headers = login(client)
    client.post("/api/employees", json=EMPLOYEE, headers=headers)
    file_id = _upload(client, headers).json()["id"]
    template = _create_template(client, headers, file_id).json()

    created = client.post(
        "/api/forms/submissions",
        json={
            "template_id": template["id"],
            "employee_id": "9003",
            "values": {"employee_name": "م. مروان أشرف الشريف", "start_date": "2026-11-15"},
        },
        headers=headers,
    )
    assert created.status_code == 201, created.text
    submission = created.json()
    assert submission["employee_id"] == "9003"
    assert submission["values"]["start_date"] == "2026-11-15"
    assert submission["status"] == "نهائي"

    unknown = client.post(
        "/api/forms/submissions",
        json={"template_id": template["id"], "values": {"hacked": "x"}},
        headers=headers,
    )
    assert unknown.status_code == 422
    assert unknown.json()["code"] == "UNKNOWN_FORM_FIELD"

    nested = client.post(
        "/api/forms/submissions",
        json={"template_id": template["id"], "values": {"employee_name": {"a": 1}}},
        headers=headers,
    )
    assert nested.status_code == 422
    assert nested.json()["code"] == "INVALID_FORM_VALUE"

    listing = client.get(
        "/api/forms/submissions", params={"employee_id": "9003"}, headers=headers
    )
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    viewer = login(client, "viewer")
    denied = client.post(
        "/api/forms/submissions",
        json={"template_id": template["id"], "values": {"employee_name": "x"}},
        headers=viewer,
    )
    assert denied.status_code == 403


def test_page_count_falls_back_when_pdf_has_no_visible_page_objects(tmp_path: Path) -> None:
    pdf = tmp_path / "compressed.pdf"
    pdf.write_bytes(b"%PDF-1.5\n/Type /XRef\n/Count 7\n%%EOF")
    assert documents.count_pdf_pages(pdf) == 7
