"""Application configuration loaded from environment / backend/.env."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env", override=False)


def _resolve(path: str) -> Path:
    p = Path(path)
    return p if p.is_absolute() else (BACKEND_DIR / p).resolve()


@dataclass(frozen=True)
class Settings:
    app_name: str = "Personal Doctor AI"
    app_version: str = "1.0.0"
    app_env: str = field(default_factory=lambda: os.getenv("APP_ENV", "development"))
    jwt_secret: str = field(default_factory=lambda: os.getenv("JWT_SECRET", ""))
    encryption_key: str = field(default_factory=lambda: os.getenv("ENCRYPTION_KEY", ""))
    database_url: str = field(
        default_factory=lambda: os.getenv("DATABASE_URL", "sqlite:///./data/personal_doctor_ai.db")
    )
    upload_dir: Path = field(default_factory=lambda: _resolve(os.getenv("UPLOAD_DIR", "./data/uploads")))
    max_upload_mb: int = field(default_factory=lambda: int(os.getenv("MAX_UPLOAD_MB", "15")))
    access_token_minutes: int = field(default_factory=lambda: int(os.getenv("ACCESS_TOKEN_MINUTES", "720")))
    frontend_origin: str = field(default_factory=lambda: os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"))
    default_openai_model: str = field(default_factory=lambda: os.getenv("DEFAULT_OPENAI_MODEL", "gpt-4.1-mini"))
    openai_timeout_seconds: float = field(default_factory=lambda: float(os.getenv("OPENAI_TIMEOUT_SECONDS", "60")))
    auth_rate_limit_per_min: int = field(default_factory=lambda: int(os.getenv("AUTH_RATE_LIMIT_PER_MIN", "10")))
    ai_rate_limit_per_min: int = field(default_factory=lambda: int(os.getenv("AI_RATE_LIMIT_PER_MIN", "20")))

    @property
    def sqlalchemy_url(self) -> str:
        """Resolve relative sqlite paths against the backend directory."""
        prefix = "sqlite:///"
        if self.database_url.startswith(prefix) and not self.database_url.startswith(prefix + "/"):
            rel = self.database_url[len(prefix):]
            return prefix + str(_resolve(rel))
        return self.database_url

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    def validate(self) -> None:
        missing = [n for n, v in (("JWT_SECRET", self.jwt_secret), ("ENCRYPTION_KEY", self.encryption_key))
                   if not v or v.startswith("change-me")]
        if missing:
            raise RuntimeError(
                f"Missing required secrets in backend/.env: {', '.join(missing)}. Run setup.command first."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
