"""AI Doctor conversations (persistent), with optional Server-Sent Events streaming."""
from __future__ import annotations

import json
from collections.abc import Iterator

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from sqlalchemy import select

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.database import session as db_session
from app.models import Conversation, Message, User
from app.repositories import conversations_repo
from app.schemas.ai import (
    ChatIn, ChatOut, ConversationCreate, ConversationDetail, ConversationOut, ConversationUpdate, MessageOut,
)
from app.schemas.common import OkResponse
from app.services import chat_service

router = APIRouter(prefix="/chat", tags=["ai doctor"])


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(user: CurrentUser, db: DB):
    convs = conversations_repo.list(db, user.id, Conversation.updated_at.desc())
    return [chat_service.conversation_out(db, c) for c in convs]


@router.post("/conversations", response_model=ConversationOut, status_code=201)
def create_conversation(body: ConversationCreate, user: CurrentUser, db: DB):
    c = conversations_repo.create(db, user.id, {"title": (body.title or "New conversation").strip()[:200],
                                                "use_health_context": body.use_health_context})
    return chat_service.conversation_out(db, c)


@router.get("/conversations/{conv_id}", response_model=ConversationDetail)
def get_conversation(conv_id: str, user: CurrentUser, db: DB):
    c = conversations_repo.get_owned(db, user.id, conv_id)
    msgs = list(db.scalars(select(Message).where(Message.conversation_id == c.id).order_by(Message.created_at.asc())))
    return {**chat_service.conversation_out(db, c), "messages": msgs}


@router.patch("/conversations/{conv_id}", response_model=ConversationOut)
def update_conversation(conv_id: str, body: ConversationUpdate, user: CurrentUser, db: DB):
    c = conversations_repo.get_owned(db, user.id, conv_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        if v is not None:
            setattr(c, k, v)
    db.flush()
    return chat_service.conversation_out(db, c)


@router.delete("/conversations/{conv_id}", response_model=OkResponse)
def delete_conversation(conv_id: str, user: CurrentUser, db: DB):
    c = conversations_repo.get_owned(db, user.id, conv_id)
    conversations_repo.delete(db, c)
    audit(db, user.id, "conversation_deleted", "conversation", conv_id)
    return OkResponse()


@router.post("/conversations/{conv_id}/messages", response_model=ChatOut)
def send_message(conv_id: str, body: ChatIn, user: CurrentUser, db: DB):
    c = conversations_repo.get_owned(db, user.id, conv_id)
    um, am = chat_service.send_message(db, user, c, body.content)
    return {"user_message": um, "assistant_message": am, "conversation": chat_service.conversation_out(db, c)}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def _msg(m: Message) -> dict:
    return MessageOut.model_validate(m).model_dump(mode="json")


@router.post("/conversations/{conv_id}/messages/stream")
def stream_message(conv_id: str, body: ChatIn, user: CurrentUser, db: DB):
    """Streams the assistant reply as SSE events: `delta` {text}, then `done` {user_message, assistant_message},
    or `error` {code, message}. Both messages are saved once the reply completes."""
    c = conversations_repo.get_owned(db, user.id, conv_id)
    safety = chat_service.check_safety(db, user, c, body.content)
    if safety:
        db.commit()
        um, am = safety

        def safety_stream() -> Iterator[str]:
            yield _sse("done", {"user_message": _msg(um), "assistant_message": _msg(am)})
        return StreamingResponse(safety_stream(), media_type="text/event-stream")

    turn = chat_service.prepare_turn(db, user, c, body.content)  # raises before streaming if not ready
    db.commit()
    user_id, content = user.id, body.content

    def event_stream() -> Iterator[str]:
        parts: list[str] = []
        try:
            for delta in chat_service.stream_reply(turn):
                parts.append(delta)
                yield _sse("delta", {"text": delta})
        except AppError as e:
            yield _sse("error", {"code": e.code, "message": e.message})
            return
        reply = "".join(parts).strip()
        if not reply:
            yield _sse("error", {"code": "ai_empty_response", "message": "The AI returned an empty response."})
            return
        with db_session.SessionLocal() as s:
            u = s.get(User, user_id)
            conv = s.get(Conversation, conv_id)
            if u is None or conv is None or conv.user_id != user_id:
                yield _sse("error", {"code": "not_found", "message": "Conversation no longer exists."})
                return
            um, am = chat_service.persist_turn(s, u, conv, content, reply, turn)
            s.commit()
            yield _sse("done", {"user_message": _msg(um), "assistant_message": _msg(am)})

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@router.post("/conversations/{conv_id}/summarize", response_model=ConversationOut)
def summarize_conversation(conv_id: str, user: CurrentUser, db: DB):
    c = conversations_repo.get_owned(db, user.id, conv_id)
    chat_service.summarize(db, user, c)
    return chat_service.conversation_out(db, c)
