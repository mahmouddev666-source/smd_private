"""FastAPI application factory."""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.errors import AppError
from app.routers import api_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("smd_hr")


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{settings.app_name} API",
        version="0.1.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=exc.detail)

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        errors = [
            {"field": ".".join(str(part) for part in err.get("loc", [])[1:]), "message": err.get("msg", "")}
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content={
                "detail": "بيانات غير صالحة، يرجى مراجعة الحقول.",
                "code": "VALIDATION_ERROR",
                "errors": errors,
            },
        )

    app.include_router(api_router, prefix="/api")

    @app.on_event("startup")
    def log_startup() -> None:
        logger.info("SMD-HR API started (env=%s, tz=%s)", settings.app_env, settings.tz)

    return app


app = create_app()
