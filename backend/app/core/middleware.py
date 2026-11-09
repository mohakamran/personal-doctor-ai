"""CSRF protection (double-submit cookie) and security headers."""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.security.tokens import (
    CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, csrf_matches, decode_access_token,
)

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}
# Pre-authentication endpoints: they act on credentials in the body, not on an existing session,
# so a stale/expired session cookie must never block them. SameSite=Strict still applies.
CSRF_EXEMPT = {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/logout"}


class CSRFMiddleware(BaseHTTPMiddleware):
    """Unsafe requests made with a *valid* session cookie must echo the CSRF cookie in a header."""

    async def dispatch(self, request: Request, call_next):
        session = request.cookies.get(SESSION_COOKIE)
        if (request.method in UNSAFE and session and request.url.path not in CSRF_EXEMPT
                and decode_access_token(session)):
            if not csrf_matches(request.cookies.get(CSRF_COOKIE), request.headers.get(CSRF_HEADER)):
                return JSONResponse(
                    status_code=403,
                    content={"error": {"code": "csrf_failed",
                                       "message": "Security check failed. Please refresh the page.",
                                       "details": None}},
                )
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith("/api/"):
            response.headers.setdefault("Cache-Control", "no-store")
        return response
