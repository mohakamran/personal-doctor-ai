"""CSRF protection (double-submit cookie) and security headers."""
from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.security.tokens import CSRF_COOKIE, CSRF_HEADER, SESSION_COOKIE, csrf_matches

UNSAFE = {"POST", "PUT", "PATCH", "DELETE"}


class CSRFMiddleware(BaseHTTPMiddleware):
    """Unsafe requests that carry a session cookie must echo the CSRF cookie in a header."""

    async def dispatch(self, request: Request, call_next):
        if request.method in UNSAFE and request.cookies.get(SESSION_COOKIE):
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
