"""Domain errors rendered as `{"detail": "...", "code": "..."}`."""

from fastapi import HTTPException, status


class AppError(HTTPException):
    def __init__(self, status_code: int, detail: str, code: str):
        super().__init__(status_code=status_code, detail={"detail": detail, "code": code})


class NotFoundError(AppError):
    def __init__(self, detail: str = "العنصر غير موجود.", code: str = "NOT_FOUND"):
        super().__init__(status.HTTP_404_NOT_FOUND, detail, code)


class ConflictError(AppError):
    def __init__(self, detail: str, code: str = "CONFLICT"):
        super().__init__(status.HTTP_409_CONFLICT, detail, code)


class ValidationError(AppError):
    def __init__(self, detail: str, code: str = "VALIDATION_ERROR"):
        super().__init__(status.HTTP_422_UNPROCESSABLE_ENTITY, detail, code)
