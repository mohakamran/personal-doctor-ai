"""AI configuration (per-user encrypted OpenAI key), privacy/consent settings."""
from __future__ import annotations

from fastapi import APIRouter

from app.config import get_settings
from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.database.base import utcnow
from app.models import AISettings
from app.schemas.ai import AIConnectionIn, AISettingsOut, AITestResult, PrivacyIn
from app.security.encryption import decrypt_secret, encrypt_secret, mask_key
from app.security.rate_limit import limiter
from app.services import ai_service

router = APIRouter(prefix="/settings", tags=["settings"])


def _out(row: AISettings) -> AISettingsOut:
    return AISettingsOut(
        provider=row.provider, has_api_key=bool(row.encrypted_api_key), masked_key=mask_key(row.key_last4),
        model=row.model, default_model=get_settings().default_openai_model, verified=row.verified,
        verified_at=row.verified_at, ai_consent=row.ai_consent, use_health_context=row.use_health_context,
        include_conversation_summaries=row.include_conversation_summaries, allow_document_ai=row.allow_document_ai,
    )


def _key_for(row: AISettings, supplied: str | None) -> str:
    if supplied:
        return supplied
    if row.encrypted_api_key:
        key = decrypt_secret(row.encrypted_api_key)
        if key:
            return key
    raise AppError(400, "ai_not_configured", "Enter your OpenAI API key first.")


@router.get("/ai", response_model=AISettingsOut)
def get_ai_settings(user: CurrentUser, db: DB):
    return _out(ai_service.get_settings_row(db, user))


@router.post("/ai/test", response_model=AITestResult)
def test_ai_connection(body: AIConnectionIn, user: CurrentUser, db: DB):
    """Verifies the key + model with a minimal request. Does not save anything."""
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_min)
    row = ai_service.get_settings_row(db, user)
    key = _key_for(row, body.api_key)
    try:
        model = ai_service.test_connection(key, body.model)
    except AppError as e:
        audit(db, user.id, "ai_connection_test", "ai_settings", row.id, success=False)
        return AITestResult(ok=False, message=e.message)
    audit(db, user.id, "ai_connection_test", "ai_settings", row.id)
    return AITestResult(ok=True, message=f"Connected successfully. Model '{model}' is available.", model=model)


@router.post("/ai/models", response_model=list[str])
def list_models(body: AIConnectionIn, user: CurrentUser, db: DB):
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_min)
    row = ai_service.get_settings_row(db, user)
    return ai_service.list_models(_key_for(row, body.api_key))


@router.put("/ai", response_model=AISettingsOut)
def save_ai_settings(body: AIConnectionIn, user: CurrentUser, db: DB):
    """Re-verifies, then stores the key encrypted at rest. The key is never returned."""
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_min)
    row = ai_service.get_settings_row(db, user)
    key = _key_for(row, body.api_key)
    ai_service.test_connection(key, body.model)  # raises a descriptive AppError on failure
    if body.api_key:
        row.encrypted_api_key = encrypt_secret(body.api_key)
        row.key_last4 = body.api_key[-4:]
    row.model = body.model
    row.verified, row.verified_at = True, utcnow()
    audit(db, user.id, "ai_settings_saved", "ai_settings", row.id)
    return _out(row)


@router.delete("/ai/key", response_model=AISettingsOut)
def remove_api_key(user: CurrentUser, db: DB):
    row = ai_service.get_settings_row(db, user)
    row.encrypted_api_key = None
    row.key_last4 = None
    row.verified, row.verified_at = False, None
    audit(db, user.id, "ai_key_removed", "ai_settings", row.id)
    return _out(row)


@router.put("/privacy", response_model=AISettingsOut)
def update_privacy(body: PrivacyIn, user: CurrentUser, db: DB):
    row = ai_service.get_settings_row(db, user)
    data = body.model_dump(exclude_unset=True, exclude_none=True)
    if data.get("ai_consent") and not row.ai_consent:
        row.ai_consent_at = utcnow()
    for k, v in data.items():
        setattr(row, k, v)
    if not row.ai_consent:
        # Withdrawing the main consent also turns off everything that depends on it.
        row.use_health_context = row.include_conversation_summaries = row.allow_document_ai = False
        row.ai_consent_at = None
    audit(db, user.id, "privacy_updated", "ai_settings", row.id)
    return _out(row)
