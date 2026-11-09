"""OpenAI integration via the Responses API.

The OpenAI client is created through a replaceable factory so automated tests can
inject a fake client (no network, no cost). API keys are only ever decrypted in
memory for the duration of a request and are never logged or returned.
"""
from __future__ import annotations

import logging
from collections.abc import Callable, Iterator
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

import openai
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import AppError
from app.models import AISettings, User
from app.security.encryption import decrypt_secret

log = logging.getLogger("pdai.ai")

PROMPT_VERSION = "1.0.0"
PROMPT_FILE = Path(__file__).resolve().parent.parent / "prompts" / "system_prompt_v1.md"
MAX_OUTPUT_TOKENS = 1500


@lru_cache
def system_prompt() -> str:
    text = PROMPT_FILE.read_text(encoding="utf-8")
    # strip the leading HTML comment header
    if text.startswith("<!--"):
        text = text.split("-->", 1)[1]
    return text.strip()


ClientFactory = Callable[[str], Any]


def _default_factory(api_key: str) -> Any:
    return openai.OpenAI(api_key=api_key, timeout=get_settings().openai_timeout_seconds, max_retries=1)


_client_factory: ClientFactory = _default_factory


def set_client_factory(factory: ClientFactory | None) -> None:
    """Used by tests to inject a mocked OpenAI client."""
    global _client_factory
    _client_factory = factory or _default_factory


def make_client(api_key: str) -> Any:
    return _client_factory(api_key)


def map_openai_error(exc: Exception) -> AppError:
    """Translate SDK errors into descriptive, non-sensitive messages."""
    if isinstance(exc, openai.AuthenticationError):
        return AppError(400, "ai_invalid_key", "OpenAI rejected the API key. Check that it is correct and active.")
    if isinstance(exc, openai.PermissionDeniedError):
        return AppError(400, "ai_permission_denied", "This API key does not have access to the selected model or project.")
    if isinstance(exc, openai.NotFoundError):
        return AppError(400, "ai_model_not_found", "The selected model is not available for this API key.")
    if isinstance(exc, openai.RateLimitError):
        return AppError(429, "ai_rate_limited",
                        "OpenAI rate limit or quota reached. Wait a moment, or check your OpenAI billing and usage limits.")
    if isinstance(exc, openai.APITimeoutError):
        return AppError(504, "ai_timeout", "OpenAI did not respond in time. Please try again.")
    if isinstance(exc, openai.APIConnectionError):
        return AppError(502, "ai_connection_error", "Could not reach OpenAI. Check your internet connection.")
    if isinstance(exc, openai.BadRequestError):
        return AppError(400, "ai_bad_request", "OpenAI could not process this request with the selected model.")
    if isinstance(exc, openai.APIStatusError):
        return AppError(502, "ai_error", f"OpenAI returned an error (status {exc.status_code}). Please try again.")
    log.error("Unexpected AI error type: %s", type(exc).__name__)
    return AppError(502, "ai_error", "The AI service returned an unexpected error.")


def test_connection(api_key: str, model: str) -> str:
    """Minimal verification request: retrieve the model (validates key + model access, no token cost)."""
    client = make_client(api_key)
    try:
        info = client.models.retrieve(model)
    except Exception as exc:  # noqa: BLE001
        raise map_openai_error(exc) from None
    return getattr(info, "id", model)


def list_models(api_key: str) -> list[str]:
    client = make_client(api_key)
    try:
        models = client.models.list()
    except Exception as exc:  # noqa: BLE001
        raise map_openai_error(exc) from None
    ids = [m.id for m in models]
    chat_like = [i for i in ids if i.startswith(("gpt-", "o1", "o3", "o4", "o5", "chatgpt-"))
                 and not any(x in i for x in ("audio", "realtime", "transcribe", "tts", "image", "search", "embedding"))]
    return sorted(set(chat_like))


# ---------------------------------------------------------------------------------------------
# Settings / readiness
# ---------------------------------------------------------------------------------------------

def get_settings_row(db: Session, user: User) -> AISettings:
    row = db.scalar(select(AISettings).where(AISettings.user_id == user.id))
    if row is None:
        row = AISettings(user_id=user.id)
        db.add(row)
        db.flush()
    return row


def require_ready(row: AISettings) -> tuple[str, str]:
    """Return (api_key, model) or raise a descriptive error."""
    if not row.encrypted_api_key:
        raise AppError(400, "ai_not_configured",
                       "AI is not configured yet. Add and test your OpenAI API key in Settings → AI configuration.")
    if not row.verified or not row.model:
        raise AppError(400, "ai_not_verified",
                       "Your OpenAI connection has not been verified. Use Test Connection in Settings, then save.")
    if not row.ai_consent:
        raise AppError(403, "consent_required",
                       "Please allow sending your messages to OpenAI in Settings → Privacy before using AI features.")
    key = decrypt_secret(row.encrypted_api_key)
    if not key:
        raise AppError(400, "ai_key_unreadable",
                       "The saved API key could not be decrypted (the encryption key may have changed). Please re-enter it.")
    return key, row.model


def build_instructions(context_text: str | None, extra: str | None = None) -> str:
    parts = [system_prompt()]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    parts.append(f"Today's date (UTC): {today}.")
    if context_text:
        parts.append("USER HEALTH CONTEXT (self-reported by the user in the app; shared with their permission):\n"
                     + context_text)
    else:
        parts.append("No saved health context is shared for this conversation. Ask for details you need.")
    if extra:
        parts.append(extra)
    return "\n\n".join(parts)


def generate(api_key: str, model: str, instructions: str, history: list[dict]) -> str:
    client = make_client(api_key)
    try:
        resp = client.responses.create(
            model=model, instructions=instructions, input=history,
            max_output_tokens=MAX_OUTPUT_TOKENS, store=False,
        )
    except Exception as exc:  # noqa: BLE001
        raise map_openai_error(exc) from None
    text = (getattr(resp, "output_text", None) or "").strip()
    if not text:
        raise AppError(502, "ai_empty_response", "The AI returned an empty response. Please try again.")
    return text


def stream_generate(api_key: str, model: str, instructions: str, history: list[dict]) -> Iterator[str]:
    """Yield text deltas. Raises AppError on failure."""
    client = make_client(api_key)
    try:
        stream = client.responses.create(
            model=model, instructions=instructions, input=history,
            max_output_tokens=MAX_OUTPUT_TOKENS, store=False, stream=True,
        )
        for event in stream:
            etype = getattr(event, "type", "")
            if etype == "response.output_text.delta":
                yield event.delta
            elif etype in ("response.failed", "error"):
                raise AppError(502, "ai_error", "The AI service reported an error while responding.")
    except AppError:
        raise
    except Exception as exc:  # noqa: BLE001
        raise map_openai_error(exc) from None
