"""Authentication schemas."""

from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: str
    username: str
    full_name: str
    role: str
    is_active: bool
    is_demo: bool
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut
