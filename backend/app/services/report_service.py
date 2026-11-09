"""Medical document storage, validation, PDF text extraction and AI explanation."""
from __future__ import annotations

import hashlib
import re
import uuid
from pathlib import Path

import pymupdf
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import AppError
from app.models import DocumentExtraction, MedicalDocument

CATEGORIES = {"lab_report", "imaging", "prescription", "discharge_summary", "consultation", "vaccination",
              "insurance", "other"}
MAX_PROMPT_CHARS = 14000

# Lines that look like lab results: a label followed by a number (optionally with unit / range).
LAB_LINE = re.compile(
    r"^(?=.*[A-Za-z]{2,})(?=.*\d).{0,80}?\b\d+(?:[.,]\d+)?\s*"
    r"(%|g/dl|g/l|mg/dl|mmol/l|µmol/l|umol/l|iu/l|u/l|mu/l|miu/l|ng/ml|pg/ml|ng/dl|µg/dl|ug/dl|x?10\^?\d+/?l|"
    r"/µl|/ul|fl|pg|mm/hr|mmhg|bpm|meq/l|cells/|k/µl|k/ul|mg/l|nmol/l|pmol/l|seconds|sec)?",
    re.IGNORECASE,
)


def user_dir(user_id: str) -> Path:
    base = get_settings().upload_dir.resolve()
    d = (base / user_id).resolve()
    if base not in d.parents:
        raise AppError(400, "invalid_path", "Invalid storage path.")
    d.mkdir(parents=True, exist_ok=True)
    return d


def file_path(doc: MedicalDocument) -> Path:
    """Resolve a stored file safely (stored names are server-generated UUIDs; still guard traversal)."""
    if not re.fullmatch(r"[0-9a-f\-]{36}\.pdf", doc.stored_filename):
        raise AppError(400, "invalid_path", "Invalid stored file name.")
    d = user_dir(doc.user_id)
    p = (d / doc.stored_filename).resolve()
    if p.parent != d:
        raise AppError(400, "invalid_path", "Invalid stored file path.")
    return p


def safe_display_name(name: str | None) -> str:
    name = Path(name or "document.pdf").name
    name = re.sub(r"[^A-Za-z0-9._ \-()]", "_", name).strip() or "document.pdf"
    return name[:200]


def validate_pdf(data: bytes, filename: str | None, content_type: str | None) -> None:
    s = get_settings()
    if not data:
        raise AppError(400, "empty_file", "The uploaded file is empty.")
    if len(data) > s.max_upload_bytes:
        raise AppError(413, "file_too_large", f"File is larger than the {s.max_upload_mb} MB limit.")
    if not (filename or "").lower().endswith(".pdf"):
        raise AppError(415, "unsupported_type", "Only PDF files are supported.")
    if content_type and content_type not in ("application/pdf", "application/x-pdf", "application/octet-stream"):
        raise AppError(415, "unsupported_type", "Only PDF files are supported.")
    if not data[:1024].lstrip().startswith(b"%PDF-"):
        raise AppError(415, "unsupported_type", "The file is not a valid PDF document.")


def extract_text(data: bytes) -> tuple[str, int, str | None]:
    """Return (text, page_count, error). Text is extracted verbatim, page by page."""
    try:
        with pymupdf.open(stream=data, filetype="pdf") as doc:
            if doc.needs_pass:
                return "", doc.page_count, "The PDF is password-protected."
            pages = []
            for i, page in enumerate(doc):
                t = page.get_text("text").strip()
                if t:
                    pages.append(f"--- Page {i + 1} ---\n{t}")
            return "\n\n".join(pages), doc.page_count, None
    except Exception:  # noqa: BLE001 — corrupted PDFs raise various errors
        return "", 0, "The PDF could not be read. It may be corrupted."


def find_lab_lines(text: str, limit: int = 80) -> list[str]:
    out: list[str] = []
    for raw in text.splitlines():
        line = " ".join(raw.split())
        if 4 <= len(line) <= 160 and LAB_LINE.search(line) and not line.lower().startswith(("page ", "--- page")):
            out.append(line)
            if len(out) >= limit:
                break
    return out


def relevant_content(text: str) -> str:
    """Drop blank/boilerplate lines and cap length so only medical content is sent."""
    boiler = re.compile(r"(confidential|page \d+ of \d+|printed on|www\.|http|tel:|fax:|email:)", re.I)
    lines = [ln.rstrip() for ln in text.splitlines() if ln.strip() and not boiler.search(ln)]
    joined = "\n".join(lines)
    if len(joined) > MAX_PROMPT_CHARS:
        joined = joined[:MAX_PROMPT_CHARS] + "\n[... document truncated for length ...]"
    return joined


def store_document(db: Session, user_id: str, data: bytes, filename: str | None, title: str | None,
                   category: str, description: str | None, report_date) -> MedicalDocument:  # noqa: ANN001
    if category not in CATEGORIES:
        raise AppError(422, "validation_error", "Unknown document category.")
    stored = f"{uuid.uuid4()}.pdf"
    path = user_dir(user_id) / stored
    path.write_bytes(data)
    display = safe_display_name(filename)
    doc = MedicalDocument(
        user_id=user_id, title=(title or display.rsplit(".", 1)[0])[:200], original_filename=display,
        stored_filename=stored, content_type="application/pdf", size_bytes=len(data),
        sha256=hashlib.sha256(data).hexdigest(), category=category, description=description,
        report_date=report_date,
    )
    db.add(doc)
    db.flush()
    text, pages, err = extract_text(data)
    status = "failed" if err else ("success" if text else "empty")
    if status == "empty":
        err = "No selectable text was found. The document may be a scanned image (OCR is a planned enhancement)."
    db.add(DocumentExtraction(document_id=doc.id, user_id=user_id, status=status, page_count=pages, text=text,
                              lab_lines=find_lab_lines(text), error=err))
    db.flush()
    return doc


def delete_file(doc: MedicalDocument) -> None:
    try:
        file_path(doc).unlink(missing_ok=True)
    except AppError:
        pass


def document_prompt_block(doc: MedicalDocument, ext: DocumentExtraction) -> str:
    meta = f"Title: {doc.title}; category: {doc.category}" + (f"; report date: {doc.report_date}" if doc.report_date else "")
    return (
        "DOCUMENT CONTEXT — text extracted verbatim from a PDF the user uploaded. Treat it as the source of truth "
        "for values. Quote values, units, dates and reference ranges exactly as written. If a value or range is "
        "missing or unreadable, say so — never fill it in.\n"
        f"{meta}\n<<<DOCUMENT TEXT\n{relevant_content(ext.text)}\nDOCUMENT TEXT>>>"
    )


EXPLAIN_REQUEST = (
    "Please explain this medical document to me in plain language. Structure your answer as:\n"
    "1. **What this document is** (one or two sentences).\n"
    "2. **Key findings** — list each result exactly as written (name, value, unit, reference range if given), and "
    "explain in simple words what that test generally measures and whether the document itself flags it as "
    "outside its reference range.\n"
    "3. **Terms explained** — any medical terms in the document.\n"
    "4. **Questions to ask your clinician**.\n"
    "Do not diagnose, do not invent values, and remind me that only my clinician can interpret it in context."
)
