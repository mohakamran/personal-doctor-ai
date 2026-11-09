"""Medical documents: upload, list, view/download, edit, delete, extraction and AI explanation."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.core.errors import AppError
from app.database.base import utcnow
from app.models import Conversation, DocumentExtraction, MedicalDocument
from app.repositories import documents_repo
from app.schemas.ai import DocumentOut, DocumentUpdate, ExplainIn, ExtractionOut
from app.schemas.common import OkResponse
from app.services import ai_service, chat_service, report_service

router = APIRouter(prefix="/records", tags=["medical records"])


def _out(db, d: MedicalDocument) -> DocumentOut:  # noqa: ANN001
    o = DocumentOut.model_validate(d)
    ext = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == d.id))
    if ext:
        o.extraction_status, o.page_count, o.has_explanation = ext.status, ext.page_count, bool(ext.ai_explanation)
    return o


@router.get("", response_model=list[DocumentOut])
def list_documents(user: CurrentUser, db: DB):
    return [_out(db, d) for d in documents_repo.list(db, user.id, MedicalDocument.created_at.desc())]


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    user: CurrentUser, db: DB,
    file: UploadFile = File(...),
    title: str | None = Form(None, max_length=200),
    category: str = Form("other"),
    description: str | None = Form(None, max_length=2000),
    report_date: date | None = Form(None),
):
    from app.config import get_settings
    data = await file.read(get_settings().max_upload_bytes + 1)
    report_service.validate_pdf(data, file.filename, file.content_type)
    doc = report_service.store_document(db, user.id, data, file.filename, (title or "").strip() or None,
                                        category, (description or "").strip() or None, report_date)
    audit(db, user.id, "document_uploaded", "document", doc.id)
    return _out(db, doc)


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, user: CurrentUser, db: DB):
    return _out(db, documents_repo.get_owned(db, user.id, doc_id))


@router.patch("/{doc_id}", response_model=DocumentOut)
def update_document(doc_id: str, body: DocumentUpdate, user: CurrentUser, db: DB):
    d = documents_repo.get_owned(db, user.id, doc_id)
    data = body.model_dump(exclude_unset=True)
    if "category" in data and data["category"] not in report_service.CATEGORIES:
        raise AppError(422, "validation_error", "Unknown document category.")
    documents_repo.update(db, d, data)
    return _out(db, d)


@router.get("/{doc_id}/file")
def download_document(doc_id: str, user: CurrentUser, db: DB, download: bool = False):
    d = documents_repo.get_owned(db, user.id, doc_id)
    path = report_service.file_path(d)
    if not path.exists():
        raise AppError(404, "file_missing", "The stored file could not be found.")
    audit(db, user.id, "document_downloaded", "document", d.id)
    return FileResponse(path, media_type="application/pdf", filename=d.original_filename,
                        content_disposition_type="attachment" if download else "inline")


@router.delete("/{doc_id}", response_model=OkResponse)
def delete_document(doc_id: str, user: CurrentUser, db: DB):
    d = documents_repo.get_owned(db, user.id, doc_id)
    report_service.delete_file(d)
    documents_repo.delete(db, d)
    audit(db, user.id, "document_deleted", "document", doc_id)
    return OkResponse()


def _extraction(db, d: MedicalDocument) -> ExtractionOut:  # noqa: ANN001
    ext = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == d.id))
    if ext is None:
        raise AppError(404, "not_found", "No extraction exists for this document.")
    conv_id = db.scalar(select(Conversation.id).where(Conversation.document_id == d.id,
                                                      Conversation.user_id == d.user_id)
                        .order_by(Conversation.created_at.desc()).limit(1))
    return ExtractionOut(document_id=d.id, status=ext.status, page_count=ext.page_count, text=ext.text,
                         lab_lines=ext.lab_lines, error=ext.error, ai_explanation=ext.ai_explanation,
                         ai_model=ext.ai_model, explained_at=ext.explained_at, conversation_id=conv_id)


@router.get("/{doc_id}/extraction", response_model=ExtractionOut)
def get_extraction(doc_id: str, user: CurrentUser, db: DB):
    return _extraction(db, documents_repo.get_owned(db, user.id, doc_id))


@router.post("/{doc_id}/explain", response_model=ExtractionOut)
def explain_document(doc_id: str, body: ExplainIn, user: CurrentUser, db: DB):
    """Sends the extracted text (never the file) to OpenAI — only with explicit consent."""
    d = documents_repo.get_owned(db, user.id, doc_id)
    if not body.consent:
        raise AppError(403, "document_consent_required", "Explicit consent is required to send this document to OpenAI.")
    row = ai_service.get_settings_row(db, user)
    if not row.allow_document_ai:
        raise AppError(403, "document_consent_required",
                       "Document analysis is turned off. Enable it in Settings → Privacy.")
    ext = db.scalar(select(DocumentExtraction).where(DocumentExtraction.document_id == d.id))
    if ext is None or not ext.text:
        raise AppError(400, "no_text", "No text could be extracted from this document, so it cannot be explained.")
    conv = Conversation(user_id=user.id, title=f"Document: {d.title}"[:200], document_id=d.id,
                        use_health_context=False)
    db.add(conv)
    db.flush()
    _, am = chat_service.send_message(db, user, conv, report_service.EXPLAIN_REQUEST)
    ext.ai_explanation, ext.ai_model, ext.explained_at = am.content, am.model, utcnow()
    audit(db, user.id, "document_explained", "document", d.id)
    db.flush()
    return _extraction(db, d)
