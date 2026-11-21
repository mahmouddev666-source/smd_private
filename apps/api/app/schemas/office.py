"""T3-09/T3-10/T3-13: response/request schemas for /api/office/*."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class OfficeStatusOut(BaseModel):
    enabled: bool
    available: bool
    documentserverVersion: str | None = None
    checkedAt: datetime


class OfficeSessionOut(BaseModel):
    id: str
    expiresAt: datetime


class OfficeVersionBrief(BaseModel):
    id: str
    number: int
    extension: str
    isOriginal: bool
    checksum: str


class OfficeConfigOut(BaseModel):
    documentServerUrl: str
    session: OfficeSessionOut
    version: OfficeVersionBrief
    config: dict[str, Any]


class OfficeVersionOut(BaseModel):
    id: str
    number: int
    source: str
    isOriginal: bool
    extension: str
    sizeBytes: int
    checksum: str
    createdAt: datetime
    createdBy: str | None = None
    createdByName: str | None = None
    pdfStatus: str
    parentVersionId: str | None = None


class OfficeVersionListOut(BaseModel):
    items: list[OfficeVersionOut]
    total: int


class OfficeConvertOut(BaseModel):
    versionId: str
    number: int


class OfficeCallbackOut(BaseModel):
    error: int


class CloseSessionIn(ORMModel):
    reason: Literal["forced", "expired"] = "forced"


class VersionDownloadQuery(BaseModel):
    disposition: Literal["attachment", "inline"] = "attachment"
