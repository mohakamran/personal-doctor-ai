"""JWT session tokens and CSRF tokens (double-submit cookie pattern)."""
from __future__ import annotations

import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from app.config import get_settings

ALGORITHM = "HS256"
SESSION_COOKIE = "pdai_session"
CSRF_COOKIE = "pdai_csrf"
CSRF_HEADER = "X-CSRF-Token"


def create_access_token(user_id: str) -> tuple[str, int]:
    s = get_settings()
    now = datetime.now(timezone.utc)
    max_age = s.access_token_minutes * 60
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(seconds=max_age), "typ": "access"}
    return jwt.encode(payload, s.jwt_secret, algorithm=ALGORITHM), max_age


def decode_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != "access":
        return None
    sub = payload.get("sub")
    return sub if isinstance(sub, str) else None


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_matches(cookie_value: str | None, header_value: str | None) -> bool:
    if not cookie_value or not header_value:
        return False
    return hmac.compare_digest(cookie_value, header_value)
