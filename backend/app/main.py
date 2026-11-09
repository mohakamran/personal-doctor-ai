"""Personal Doctor AI — FastAPI application entry point."""
from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import appointments, auth, chat, health, medications, profile, records, settings, symptoms
from app.config import get_settings
from app.core.errors import register_error_handlers
from app.core.middleware import CSRFMiddleware, SecurityHeadersMiddleware
from app.database import session as db_session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


def create_app() -> FastAPI:
    s = get_settings()
    s.validate()
    s.upload_dir.mkdir(parents=True, exist_ok=True)

    app = FastAPI(
        title="Personal Doctor AI API",
        version=s.app_version,
        description="Local API for Personal Doctor AI — an AI health education assistant. "
                    "Not a medical device; does not diagnose or prescribe.",
        docs_url="/docs", redoc_url="/redoc", openapi_url="/openapi.json",
    )
    register_error_handlers(app)
    app.add_middleware(CSRFMiddleware)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[s.frontend_origin, s.frontend_origin.replace("localhost", "127.0.0.1")],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )

    for r in (auth, profile, health, symptoms, medications, appointments, records, chat, settings):
        app.include_router(r.router, prefix="/api/v1")

    @app.get("/api/health", tags=["system"])
    def healthcheck():
        with db_session.engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "app": s.app_name, "version": s.app_version, "database": "ok"}

    return app


app = create_app()
