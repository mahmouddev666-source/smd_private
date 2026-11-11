"""Password hashing, JWT tokens and role-based access control."""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from pwdlib import PasswordHash
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import AppError
from app.db.session import get_db
from app.models.user import User

password_hash = PasswordHash.recommended()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

VALID_ROLES = ("ADMIN", "HR", "SUPERVISOR", "VIEWER")
EDITOR_ROLES = ("ADMIN", "HR", "SUPERVISOR")


def hash_password(raw_password: str) -> str:
    return password_hash.hash(raw_password)


def verify_password(raw_password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(raw_password, hashed)
    except Exception:
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.id,
        "username": user.username,
        "role": user.role,
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(minutes=settings.access_token_expire_minutes)).timestamp()),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى.", "TOKEN_EXPIRED") from exc
    except jwt.PyJWTError as exc:
        raise AppError(401, "جلسة غير صالحة، يرجى تسجيل الدخول.", "INVALID_TOKEN") from exc


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not token:
        raise AppError(401, "يجب تسجيل الدخول للوصول إلى هذا المورد.", "NOT_AUTHENTICATED")
    payload = decode_token(token)
    if payload.get("type") != "access":
        raise AppError(401, "نوع الجلسة غير صالح.", "INVALID_TOKEN_TYPE")
    user = db.get(User, payload.get("sub"))
    if user is None or not user.is_active:
        raise AppError(401, "الحساب غير موجود أو موقوف.", "ACCOUNT_DISABLED")
    return user


def require_role(*allowed_roles: str):
    """Dependency factory: allow only the given roles."""

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles:
            raise AppError(403, "لا تملك صلاحية تنفيذ هذا الإجراء.", "FORBIDDEN")
        return user

    return checker
