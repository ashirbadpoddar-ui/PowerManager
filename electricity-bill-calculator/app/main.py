import logging
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.cors import CORSMiddleware

from app.api.routes.electricity import router as electricity_router
from app.api.routes.auth import router as auth_router
from app.api.routes.settings import router as settings_router
from app.core.config import settings
from app.routes.bills import router as bills_router
from app.routes.search import router as search_router
from app.routes.users import router as users_router
from app.routes.properties import router as properties_router
from app.routes.meter_readings import router as meter_readings_router
from app.routes.my_account import router as my_account_router

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Calculate electricity bills with server-side slab-based pricing and detailed breakdowns.",
    docs_url=None if settings.app_env == "production" else "/docs",
    redoc_url=None if settings.app_env == "production" else "/redoc",
    openapi_url=None if settings.app_env == "production" else "/openapi.json",
)
app.include_router(auth_router)
app.include_router(electricity_router, prefix="/api/electricity", tags=["electricity"])
app.include_router(settings_router, prefix="/api/electricity", tags=["settings"])
app.include_router(bills_router)
app.include_router(search_router)
app.include_router(users_router)
app.include_router(properties_router)
app.include_router(meter_readings_router)
app.include_router(my_account_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-CSRF-Token"],
    expose_headers=["X-Request-ID", "X-CSRF-Token"],
)

logger = logging.getLogger("powermanage.http")


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Pydantic includes rejected input (including passwords/setup tokens) in
    # errors. Keep field diagnostics without copying credentials into responses.
    errors = [
        {key: error[key] for key in ("type", "loc", "msg") if key in error}
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


@app.middleware("http")
async def security_headers_and_request_context(request: Request, call_next):
    request.state.request_id = uuid4().hex
    response = await call_next(request)
    response.headers["X-Request-ID"] = request.state.request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; base-uri 'self'; object-src 'none'; "
        "frame-ancestors 'none'; img-src 'self' data:; "
        "style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    if settings.app_env == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    if response.status_code in {401, 403, 429}:
        logger.warning(
            "security_response status=%s method=%s path=%s request_id=%s",
            response.status_code,
            request.method,
            request.url.path,
            request.state.request_id,
        )
    return response


@app.exception_handler(SQLAlchemyError)
async def database_exception_handler(request: Request, exc: SQLAlchemyError):
    logger.exception("database_error request_id=%s path=%s", request.state.request_id, request.url.path)
    return JSONResponse(status_code=503, content={"detail": "The service is temporarily unavailable."})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("unhandled_error request_id=%s path=%s", request.state.request_id, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})
