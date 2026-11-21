"""T3-05: immutable versions — gap-free numbering, dedupe, atomic writes."""

import hashlib
from pathlib import Path

import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.core.errors import ConflictError
from app.models.form import FormFile, FormFileVersion
from app.services import versions
from app.utils.ids import new_id

from tests.test_forms import _docx_bytes


@pytest.fixture(autouse=True)
def temp_storage(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "storage_dir", str(tmp_path))


def _file(db) -> FormFile:
    file = FormFile(
        id=new_id(),
        original_name="نموذج.docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        kind="word",
        size_bytes=0,
        checksum="",
        storage_path="forms/old.docx",
        is_active=True,
        is_demo=False,
    )
    db.add(file)
    db.commit()
    return file


def _create(db, file, data: bytes, **overrides):
    kwargs = dict(
        data=data,
        kind="word",
        extension="docx",
        mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        source="onlyoffice",
    )
    kwargs.update(overrides)
    return versions.create_version(db, file, **kwargs)


def test_versions_are_numbered_sequentially_and_never_overwrite(db) -> None:
    file = _file(db)
    payloads = [_docx_bytes() + f"<!-- {i} -->".encode() for i in range(1, 4)]
    created = [_create(db, file, payload) for payload in payloads]

    assert [v.version_no for v in created] == [1, 2, 3]
    assert file.current_version_id == created[-1].id
    assert file.checksum == hashlib.sha256(payloads[-1]).hexdigest()
    assert file.size_bytes == len(payloads[-1])

    folder = Path(settings.storage_dir) / "forms" / file.id
    paths = sorted(folder.glob("*.docx"))
    assert len(paths) == 3
    assert len({p.name for p in paths}) == 3
    assert all(p.stat().st_size > 0 for p in paths)
    assert not list(folder.glob("*.tmp"))


def test_duplicate_checks_only_the_current_version(db) -> None:
    file = _file(db)
    first = _docx_bytes() + b"first"
    second = _docx_bytes() + b"second"

    v1 = _create(db, file, first)
    assert versions.is_duplicate_of_current(db, file, v1.checksum) is True
    assert versions.is_duplicate_of_current(db, file, hashlib.sha256(second).hexdigest()) is False

    v2 = _create(db, file, second)
    assert versions.is_duplicate_of_current(db, file, v1.checksum) is False
    assert versions.is_duplicate_of_current(db, file, v2.checksum) is True

    # A restore may reintroduce an old checksum as a brand-new version.
    v3 = _create(db, file, first, source="restore", parent_id=v1.id)
    assert v3.version_no == 3
    assert v3.checksum == v1.checksum
    assert v3.id != v1.id


def test_failed_write_leaves_neither_row_nor_orphan_file(db, monkeypatch) -> None:
    file = _file(db)
    payload = _docx_bytes()

    def boom(*args, **kwargs):
        raise RuntimeError("simulated DB failure")

    monkeypatch.setattr(versions, "record_audit", boom)
    with pytest.raises(RuntimeError):
        _create(db, file, payload)

    count = db.scalar(select(func.count()).select_from(FormFileVersion))
    assert count == 0
    assert file.current_version_id is None
    folder = Path(settings.storage_dir) / "forms" / file.id
    assert not folder.exists() or not list(folder.glob("*.docx"))


def test_existing_target_is_never_overwritten(db, monkeypatch) -> None:
    file = _file(db)
    payload = _docx_bytes()
    relative = f"forms/{file.id}/v1_{hashlib.sha256(payload).hexdigest()[:8]}.docx"
    target = Path(settings.storage_dir) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(b"keep me")

    with pytest.raises(ConflictError) as excinfo:
        _create(db, file, payload)
    assert excinfo.value.detail["code"] == "OFFICE_VERSION_FILE_EXISTS"
    assert target.read_bytes() == b"keep me"
    assert db.scalar(select(func.count()).select_from(FormFileVersion)) == 0
