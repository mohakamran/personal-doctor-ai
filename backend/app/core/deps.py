"""FastAPI dependencies: database session and authenticated user."""
from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.database.session import get_db
from app.models import User
from app.security.tokens import SESSION_COOKIE, decode_access_token

DB = Annotated[Session, Depends(get_db)]


def get_current_user(request: Request, db: DB) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    user_id = decode_access_token(token) if token else None
    if not user_id:
        raise AppError(401, "not_authenticated", "Please sign in to continue.")
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise AppError(401, "not_authenticated", "Please sign in to continue.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"
