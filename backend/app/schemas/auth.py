from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.common import ORMModel


def _password_rules(v: str) -> str:
    if len(v) < 10:
        raise ValueError("Password must be at least 10 characters.")
    if not any(c.isalpha() for c in v) or not any(c.isdigit() for c in v):
        raise ValueError("Password must include letters and numbers.")
    return v


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)
    display_name: str = Field(min_length=1, max_length=120)

    _pw = field_validator("password")(_password_rules)

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Name is required.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(max_length=128)

    _pw = field_validator("new_password")(_password_rules)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirm: str

    @field_validator("confirm")
    @classmethod
    def _confirm(cls, v: str) -> str:
        if v != "DELETE":
            raise ValueError('Type DELETE to confirm.')
        return v


class UserOut(ORMModel):
    id: str
    email: str
    display_name: str
    unit_system: str
    country_code: str | None
    emergency_number: str | None
    created_at: datetime


class UpdateAccountRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    unit_system: str | None = Field(default=None, pattern="^(metric|imperial)$")
    country_code: str | None = Field(default=None, pattern="^[A-Z]{2}$")
    emergency_number: str | None = Field(default=None, max_length=20, pattern=r"^[0-9+ \-]*$")
