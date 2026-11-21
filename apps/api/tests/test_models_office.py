"""T3-03: document versions / editor sessions schema and DB invariants."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import inspect, text
from sqlalchemy.exc import IntegrityError

from app.models.form import FormFile, FormFileVersion, FormSubmission, FormTemplate, OfficeSession
from app.utils.ids import new_id


def _file(**overrides: object) -> FormFile:
    values = dict(
        id=new_id(),
        original_name="عقد.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind="word",
        size_bytes=100,
        checksum="a" * 64,
        storage_path="forms/test.docx",
        page_count=1,
    )
    values.update(overrides)
    return FormFile(**values)  # type: ignore[arg-type]


def _version(file: FormFile, version_no: int = 1, original: bool = False, **overrides: object) -> FormFileVersion:
    values = dict(
        id=new_id(),
        file_id=file.id,
        version_no=version_no,
        storage_path=f"forms/versions/{file.id}-{version_no}.docx",
        checksum=f"{version_no:064x}",
        size_bytes=100,
        mime=file.mime,
        extension="docx",
        kind="word",
        source="upload",
        is_original=original,
    )
    values.update(overrides)
    return FormFileVersion(**values)  # type: ignore[arg-type]


def test_metadata_contains_new_tables_columns_and_indexes(db) -> None:
    inspector = inspect(db.bind)
    tables = set(inspector.get_table_names())
    assert {"form_file_versions", "office_sessions"} <= tables

    assert "current_version_id" in {c["name"] for c in inspector.get_columns("form_files")}
    fk_targets = [fk["referred_table"] for fk in inspector.get_foreign_keys("form_files")]
    assert "form_file_versions" not in fk_targets  # decision #1: no FK

    submission_columns = {c["name"] for c in inspector.get_columns("form_submissions")}
    assert {
        "document_version_id",
        "rendered_pdf_path",
        "rendered_checksum",
        "snapshot_status",
        "snapshot_error",
        "snapshot_attempts",
    } <= submission_columns
    template_columns = {c["name"] for c in inspector.get_columns("form_templates")}
    assert "document_version_id" in template_columns

    version_indexes = {i["name"] for i in inspector.get_indexes("form_file_versions")}
    assert {"ux_form_file_versions_one_original", "ix_form_file_versions_checksum"} <= version_indexes
    version_uniques = {u["name"] for u in inspector.get_unique_constraints("form_file_versions")}
    assert "uq_form_file_versions_file_version" in version_uniques
    session_indexes = {i["name"] for i in inspector.get_indexes("office_sessions")}
    assert {"ux_office_sessions_open_file", "ix_office_sessions_document_key"} <= session_indexes


def test_one_original_version_per_file(db) -> None:
    file = _file()
    db.add(file)
    db.add(_version(file, 1, original=True))
    db.commit()

    db.add(_version(file, 2, original=True))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_version_numbers_unique_per_file(db) -> None:
    file = _file()
    db.add(file)
    db.add(_version(file, 1, original=True))
    db.commit()

    db.add(_version(file, 1, source="onlyoffice"))
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_check_constraints_on_version_and_snapshot(db) -> None:
    file = _file()
    db.add(file)
    template = FormTemplate(
        id=new_id(), name="عقد", category="عام", description="", file_id=file.id, fields=[]
    )
    db.add(template)
    db.commit()

    bad_version = _version(file, 1, original=True, pdf_status="unknown")
    db.add(bad_version)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    submission = FormSubmission(
        id=new_id(),
        template_id=template.id,
        values={},
        snapshot_status="ready",
        snapshot_attempts=-1,
    )
    db.add(submission)
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()


def test_version_parent_children_self_reference(db) -> None:
    file = _file()
    parent = _version(file, 1, original=True)
    child = _version(file, 2, source="onlyoffice")
    child.parent = parent
    db.add_all([file, parent, child])
    db.commit()

    db.refresh(child)
    assert child.parent_version_id == parent.id
    assert [v.id for v in parent.children] == [child.id]


def test_single_open_office_session_per_file(db) -> None:
    file = _file()
    version = _version(file, 1, original=True)
    db.add_all([file, version])
    db.commit()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    def _session() -> OfficeSession:
        return OfficeSession(
            id=new_id(),
            file_id=file.id,
            version_id=version.id,
            document_key=f"smd-{file.id}-{version.id}",
            user_id="user-1",
            user_name="مدير الموارد",
            last_seen_at=now,
            expires_at=now + timedelta(hours=12),
        )

    db.add(_session())
    db.commit()
    db.add(_session())
    with pytest.raises(IntegrityError):
        db.commit()
    db.rollback()

    # Closing the first session releases the exclusive lock.
    db.execute(text("UPDATE office_sessions SET closed_at = CURRENT_TIMESTAMP"))
    db.commit()
    db.add(_session())
    db.commit()
    assert db.query(OfficeSession).count() == 2
