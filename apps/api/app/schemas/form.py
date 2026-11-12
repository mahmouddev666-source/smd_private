"""Schemas for the document engine (files, templates, submissions)."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.common import ORMModel

BINDING_PATTERN = r"^[a-zA-Z][a-zA-Z0-9_.]{0,63}$"
KEY_PATTERN = r"^[a-z][a-z0-9_]{0,63}$"


class FieldPlacement(BaseModel):
    """One field on top of the original document.

    Coordinates are relative percentages of the page (0–100), so the same
    template renders correctly at any zoom level and in print.
    """

    key: str = Field(pattern=KEY_PATTERN)
    binding: str = Field(pattern=BINDING_PATTERN)
    label: str = Field(default="", max_length=80)
    page: int = Field(ge=1, le=200)
    x: float = Field(ge=0, le=100)
    y: float = Field(ge=0, le=100)
    width: float = Field(gt=0, le=100)
    height: float = Field(gt=0, le=100)
    font_size: float = Field(default=11, ge=6, le=72)
    font_weight: Literal["normal", "bold"] = "normal"
    align: Literal["right", "center", "left"] = "right"
    color: str = Field(default="#000000", pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def validate_bounds(self) -> "FieldPlacement":
        if self.x + self.width > 100.01 or self.y + self.height > 100.01:
            raise ValueError("الحقل يتجاوز حدود الصفحة (المجموع يجب ألا يتجاوز 100%).")
        return self


def _ensure_unique_keys(fields: list[FieldPlacement]) -> None:
    keys = [field.key for field in fields]
    if len(keys) != len(set(keys)):
        raise ValueError("لا يمكن تكرار نفس المفتاح (key) في أكثر من حقل.")


class FormFileOut(ORMModel):
    id: str
    original_name: str
    mime: str
    kind: str
    size_bytes: int
    page_count: int
    created_at: datetime


class TemplateCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    category: str = Field(default="عام", min_length=2, max_length=60)
    description: str = Field(default="", max_length=500)
    file_id: str = Field(min_length=1, max_length=36)
    fields: list[FieldPlacement] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def validate_fields(self) -> "TemplateCreate":
        _ensure_unique_keys(self.fields)
        return self


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    category: str | None = Field(default=None, min_length=2, max_length=60)
    description: str | None = Field(default=None, max_length=500)
    fields: list[FieldPlacement] | None = Field(default=None, max_length=200)
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_fields(self) -> "TemplateUpdate":
        if self.fields is not None:
            _ensure_unique_keys(self.fields)
        return self


class TemplateOut(ORMModel):
    id: str
    name: str
    category: str
    description: str
    file_id: str
    fields: list[FieldPlacement]
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SubmissionCreate(BaseModel):
    template_id: str = Field(min_length=1, max_length=36)
    employee_id: str | None = Field(default=None, max_length=32)
    values: dict[str, Any] = Field(default_factory=dict)
    status: Literal["مسودة", "نهائي"] = "نهائي"

    @model_validator(mode="after")
    def validate_values_size(self) -> "SubmissionCreate":
        if len(self.values) > 200:
            raise ValueError("عدد القيم يتجاوز الحد المسموح (200).")
        return self


class SubmissionOut(ORMModel):
    id: str
    template_id: str
    employee_id: str | None
    values: dict[str, Any]
    status: str
    created_by: str | None
    created_at: datetime
