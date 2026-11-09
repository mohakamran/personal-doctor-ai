"""Authentication: register, login, logout, current user, password change, account deletion."""
from __future__ import annotations

import shutil

from fastapi import APIRouter, Request, Response
from sqlalchemy import func, select

from app.config import get_settings
from app.core.audit import audit
from app.core.deps import DB, CurrentUser, client_ip
from app.core.errors import AppError
from app.database.base import utcnow
from app.models import AISettings, HealthProfile, User
from app.schemas.auth import (
    ChangePasswordRequest, DeleteAccountRequest, LoginRequest, RegisterRequest, UpdateAccountRequest, UserOut,
)
from app.schemas.common import OkResponse
from app.security.passwords import DUMMY_HASH, hash_password, verify_password
from app.security.rate_limit import limiter
from app.security.tokens import CSRF_COOKIE, SESSION_COOKIE, create_access_token, new_csrf_token
from app.services import report_service

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_session(response: Response, user_id: str) -> None:
    token, max_age = create_access_token(user_id)
    secure = get_settings().app_env == "production"
    response.set_cookie(SESSION_COOKIE, token, max_age=max_age, httponly=True, samesite="strict",
                        secure=secure, path="/")
    response.set_cookie(CSRF_COOKIE, new_csrf_token(), max_age=max_age, httponly=False, samesite="strict",
                        secure=secure, path="/")


def _clear_session(response: Response) -> None:
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, request: Request, response: Response, db: DB):
    limiter.check(f"auth:{client_ip(request)}", get_settings().auth_rate_limit_per_min)
    email = body.email.lower()
    if db.scalar(select(func.count()).select_from(User).where(User.email == email)):
        raise AppError(409, "email_taken", "An account with this email already exists.")
    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name)
    db.add(user)
    db.flush()
    db.add(HealthProfile(user_id=user.id))
    db.add(AISettings(user_id=user.id, model=get_settings().default_openai_model))
    audit(db, user.id, "register", "user", user.id)
    user.last_login_at = utcnow()
    _set_session(response, user.id)
    return user


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: DB):
    limiter.check(f"auth:{client_ip(request)}", get_settings().auth_rate_limit_per_min)
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user is None:
        verify_password(DUMMY_HASH, body.password)  # equalize timing
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    if not verify_password(user.password_hash, body.password) or not user.is_active:
        audit(db, user.id, "login_failed", "user", user.id, success=False)
        db.commit()
        raise AppError(401, "invalid_credentials", "Incorrect email or password.")
    user.last_login_at = utcnow()
    audit(db, user.id, "login", "user", user.id)
    _set_session(response, user.id)
    return user


@router.post("/logout", response_model=OkResponse)
def logout(response: Response):
    _clear_session(response)
    return OkResponse()


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_me(body: UpdateAccountRequest, user: CurrentUser, db: DB):
    data = body.model_dump(exclude_unset=True)
    if "display_name" in data and data["display_name"]:
        data["display_name"] = data["display_name"].strip()
    if data.get("emergency_number") == "":
        data["emergency_number"] = None
    for k, v in data.items():
        setattr(user, k, v)
    audit(db, user.id, "account_updated", "user", user.id)
    return user


@router.post("/change-password", response_model=OkResponse)
def change_password(body: ChangePasswordRequest, request: Request, user: CurrentUser, db: DB):
    limiter.check(f"auth:{client_ip(request)}", get_settings().auth_rate_limit_per_min)
    if not verify_password(user.password_hash, body.current_password):
        raise AppError(400, "invalid_password", "Current password is incorrect.")
    user.password_hash = hash_password(body.new_password)
    audit(db, user.id, "password_changed", "user", user.id)
    return OkResponse()


@router.delete("/account", response_model=OkResponse)
def delete_account(body: DeleteAccountRequest, request: Request, response: Response, user: CurrentUser, db: DB):
    """Permanently deletes the account, all health data (DB cascade) and uploaded files."""
    limiter.check(f"auth:{client_ip(request)}", get_settings().auth_rate_limit_per_min)
    if not verify_password(user.password_hash, body.password):
        raise AppError(400, "invalid_password", "Password is incorrect.")
    folder = report_service.user_dir(user.id)
    db.delete(user)
    db.flush()
    shutil.rmtree(folder, ignore_errors=True)
    _clear_session(response)
    return OkResponse()
