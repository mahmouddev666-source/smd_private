"""Authentication endpoints."""

from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.core.security import create_access_token, get_current_user, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def _authenticate(db: Session, username: str, password: str) -> User:
    user = db.scalar(select(User).where(User.username == username.strip()))
    if user is None or not verify_password(password, user.password_hash):
        raise AppError(
            status.HTTP_401_UNAUTHORIZED,
            "اسم المستخدم أو كلمة المرور غير صحيحة.",
            "INVALID_CREDENTIALS",
        )
    if not user.is_active:
        raise AppError(status.HTTP_403_FORBIDDEN, "الحساب موقوف، راجع الإدارة.", "ACCOUNT_DISABLED")
    return user


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user),
        expires_in=settings.access_token_expire_minutes * 60,
        user=UserOut.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    return _token_response(_authenticate(db, payload.username, payload.password))


@router.post("/token", response_model=TokenResponse, include_in_schema=False)
def login_token(
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
) -> TokenResponse:
    """OAuth2 form endpoint used by the Swagger UI authorisation button."""
    return _token_response(_authenticate(db, form.username, form.password))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
