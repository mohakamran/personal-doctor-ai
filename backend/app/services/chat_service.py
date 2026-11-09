"""Conversation orchestration: safety check → consent/config → context → AI → persistence."""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.audit import audit
from app.core.errors import AppError
from app.database.base import utcnow
from app.models import Conversation, DocumentExtraction, MedicalDocument, Message, User
from app.security.rate_limit import limiter
from app.services import ai_service, context_service, report_service, safety_service

HISTORY_LIMIT = 20


def conversation_out(db: Session, c: Conversation) -> dict:
    count = db.scalar(select(func.count()).select_from(Message).where(Message.conversation_id == c.id)) or 0
    last = db.scalar(select(Message.content).where(Message.conversation_id == c.id)
                     .order_by(Message.created_at.desc()).limit(1))
    return {
        "id": c.id, "title": c.title, "summary": c.summary, "document_id": c.document_id,
        "use_health_context": c.use_health_context, "created_at": c.created_at, "updated_at": c.updated_at,
        "message_count": count, "last_message_preview": (last[:140] if last else None),
    }


@dataclass
class PreparedTurn:
    api_key: str
    model: str
    instructions: str
    history: list[dict]
    context_sections: list[str]


def _title_from(text: str) -> str:
    t = " ".join(text.split())
    return (t[:57] + "…") if len(t) > 60 else t


def _document_block(db: Session, conv: Conversation, user: User) -> str | None:
    if not conv.document_id:
        return None
    doc = db.scalar(select(MedicalDocument).where(MedicalDocument.id == conv.document_id,
                                                   MedicalDocument.user_id == user.id))
    ext = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == conv.document_id))
    if not doc or not ext or not ext.text:
        return None
    return report_service.document_prompt_block(doc, ext)


def check_safety(db: Session, user: User, conv: Conversation, content: str) -> tuple[Message, Message] | None:
    result = safety_service.assess(content)
    if not result.triggered:
        return None
    um = Message(conversation_id=conv.id, user_id=user.id, role="user", content=content)
    am = Message(conversation_id=conv.id, user_id=user.id, role="assistant",
                 content=safety_service.urgent_response(result, user.country_code, user.emergency_number),
                 safety_flag=result.category)
    db.add_all([um, am])
    if conv.title == "New conversation":
        conv.title = _title_from(content)
    conv.updated_at = utcnow()
    audit(db, user.id, "safety_escalation", "conversation", conv.id)
    db.flush()
    return um, am


def prepare_turn(db: Session, user: User, conv: Conversation, content: str) -> PreparedTurn:
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_min)
    row = ai_service.get_settings_row(db, user)
    api_key, model = ai_service.require_ready(row)

    sections: list[str] = []
    context_text = None
    if row.use_health_context and conv.use_health_context:
        ctx = context_service.build_context(db, user, content, row.include_conversation_summaries,
                                            exclude_conversation_id=conv.id)
        context_text, sections = ctx.text or None, ctx.sections

    extra = None
    if conv.document_id:
        if not row.allow_document_ai:
            raise AppError(403, "document_consent_required",
                           "Allow document analysis in Settings → Privacy to ask questions about this document.")
        extra = _document_block(db, conv, user)
        if extra:
            sections.append("document")

    prior = list(db.scalars(select(Message).where(Message.conversation_id == conv.id)
                            .order_by(Message.created_at.desc()).limit(HISTORY_LIMIT)))
    history = [{"role": m.role, "content": m.content} for m in reversed(prior) if m.role in ("user", "assistant")]
    history.append({"role": "user", "content": content})
    return PreparedTurn(api_key, model, ai_service.build_instructions(context_text, extra), history, sections)


def persist_turn(db: Session, user: User, conv: Conversation, content: str, reply: str,
                 turn: PreparedTurn) -> tuple[Message, Message]:
    um = Message(conversation_id=conv.id, user_id=user.id, role="user", content=content)
    db.add(um)
    db.flush()
    am = Message(conversation_id=conv.id, user_id=user.id, role="assistant", content=reply,
                 model=turn.model, context_used=turn.context_sections)
    db.add(am)
    if conv.title == "New conversation":
        conv.title = _title_from(content)
    conv.updated_at = utcnow()
    audit(db, user.id, "ai_message", "conversation", conv.id)
    db.flush()
    return um, am


def send_message(db: Session, user: User, conv: Conversation, content: str) -> tuple[Message, Message]:
    safety = check_safety(db, user, conv, content)
    if safety:
        return safety
    turn = prepare_turn(db, user, conv, content)
    reply = ai_service.generate(turn.api_key, turn.model, turn.instructions, turn.history)
    return persist_turn(db, user, conv, content, reply, turn)


def stream_reply(turn: PreparedTurn) -> Iterator[str]:
    return ai_service.stream_generate(turn.api_key, turn.model, turn.instructions, turn.history)


SUMMARY_INSTRUCTIONS = (
    "Summarize the following conversation between a user and a health education assistant in at most 5 "
    "short bullet points for the user's own records and to prepare for a consultation. Include only what was "
    "actually said: symptoms the user reported, questions raised, and suggested next steps. Do not add new "
    "advice, diagnoses, or values. Write in the third person ('The user reported…')."
)


def summarize(db: Session, user: User, conv: Conversation) -> str:
    limiter.check(f"ai:{user.id}", get_settings().ai_rate_limit_per_min)
    row = ai_service.get_settings_row(db, user)
    api_key, model = ai_service.require_ready(row)
    msgs = list(db.scalars(select(Message).where(Message.conversation_id == conv.id)
                           .order_by(Message.created_at.asc())))
    if not msgs:
        raise AppError(400, "empty_conversation", "This conversation has no messages to summarize.")
    transcript = "\n\n".join(f"{m.role.upper()}: {m.content[:2000]}" for m in msgs[-40:])
    summary = ai_service.generate(api_key, model, SUMMARY_INSTRUCTIONS, [{"role": "user", "content": transcript}])
    conv.summary = summary
    audit(db, user.id, "conversation_summarized", "conversation", conv.id)
    return summary
