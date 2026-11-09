"""Encryption at rest for user API credentials (Fernet: AES-128-CBC + HMAC-SHA256).

The master key lives in backend/.env (ENCRYPTION_KEY), never in SQLite.
"""
from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings


def _fernet() -> Fernet:
    return Fernet(get_settings().encryption_key.encode())


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str | None:
    try:
        return _fernet().decrypt(ciphertext.encode()).decode()
    except (InvalidToken, ValueError):
        return None


def mask_key(last4: str | None) -> str | None:
    return f"sk-…{last4}" if last4 else None
