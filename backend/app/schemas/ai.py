from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel


class AISettingsOut(BaseModel):
    provider: str = "openai"
    has_api_key: bool
    masked_key: str | None
    model: str | None
    default_model: str
    verified: bool
    verified_at: datetime | None
    ai_consent: bool
    use_health_context: bool
    include_conversation_summaries: bool
    allow_document_ai: bool


def _model_name(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    import re
    if not re.fullmatch(r"[A-Za-z0-9._:\-/]{1,80}", v):
        raise ValueError("Model name contains invalid characters.")
    return v


class AIConnectionIn(BaseModel):
    api_key: str | None = Field(default=None, max_length=300)
    model: str = Field(min_length=1, max_length=80)

    _m = field_validator("model")(_model_name)

    @field_validator("api_key")
    @classmethod
    def _key(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = v.strip()
        if not v:
            return None
        if any(c.isspace() for c in v) or len(v) < 20:
            raise ValueError("This does not look like a valid API key.")
        return v


class AITestResult(BaseModel):
    ok: bool
    message: str
    model: str | None = None


class PrivacyIn(BaseModel):
    ai_consent: bool | None = None
    use_health_context: bool | None = None
    include_conversation_summaries: bool | None = None
    allow_document_ai: bool | None = None


class ConversationCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    use_health_context: bool = True


class ConversationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    use_health_context: bool | None = None


class MessageOut(ORMModel):
    id: str
    role: str
    content: str
    safety_flag: str | None
    model: str | None
    context_used: list[str]
    created_at: datetime


class ConversationOut(ORMModel):
    id: str
    title: str
    summary: str | None
    document_id: str | None
    use_health_context: bool
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_preview: str | None = None


class ConversationDetail(ConversationOut):
    messages: list[MessageOut]


class ChatIn(BaseModel):
    content: str = Field(min_length=1, max_length=8000)

    @field_validator("content")
    @classmethod
    def _c(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Message cannot be empty.")
        return v


class ChatOut(BaseModel):
    user_message: MessageOut
    assistant_message: MessageOut
    conversation: ConversationOut


class DocumentOut(ORMModel):
    id: str
    title: str
    original_filename: str
    content_type: str
    size_bytes: int
    category: str
    description: str | None
    report_date: date | None
    created_at: datetime
    extraction_status: str | None = None
    page_count: int = 0
    has_explanation: bool = False


class DocumentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    category: str | None = None
    description: str | None = Field(default=None, max_length=2000)
    report_date: date | None = None


class ExtractionOut(BaseModel):
    document_id: str
    status: str
    page_count: int
    text: str
    lab_lines: list[str]
    error: str | None
    ai_explanation: str | None
    ai_model: str | None
    explained_at: datetime | None
    conversation_id: str | None = None


class ExplainIn(BaseModel):
    consent: bool = Field(description="Explicit consent to send this document's text to OpenAI.")
