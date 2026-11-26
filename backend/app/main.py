import logging
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth, cameras, devices, users
from app.core.config import DEFAULT_SECRET, get_settings
from app.services.bootstrap import ensure_first_admin

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings = get_settings()
    if settings.is_production and (settings.secret_key == DEFAULT_SECRET or not settings.credentials_key):
        raise RuntimeError("Set VMS_SECRET_KEY and VMS_CREDENTIALS_KEY before running in production")
    if settings.is_production and settings.dev_no_auth:
        raise RuntimeError("VMS_DEV_NO_AUTH is for development only - remove it in production")
    await ensure_first_admin()
    yield


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan,
                  docs_url="/api/docs", openapi_url="/api/openapi.json")
    if settings.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins,
                           allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["system"])
    async def health():
        return {"status": "ok"}

    api.include_router(auth.router)
    api.include_router(users.router)
    api.include_router(devices.router)
    api.include_router(cameras.router)
    app.include_router(api)
    return app


app = create_app()
