"""Health summary (consultation preparation) and full data export. No AI involved — data is quoted as recorded."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    AISettings, Allergy, Appointment, Conversation, DocumentExtraction, HealthMeasurement, HealthProfile,
    MedicalCondition, MedicalDocument, Medication, Message, Symptom, User,
)
from app.services.health_service import age_from_dob, calc_bmi, is_medication_active

LABELS = {
    "weight": "Weight", "height": "Height", "bmi": "BMI (recorded)", "blood_pressure": "Blood pressure",
    "heart_rate": "Heart rate", "blood_glucose": "Blood glucose", "sleep": "Sleep", "water": "Water intake",
}


def _fmt(m: HealthMeasurement) -> str:
    v = f"{m.value:g}/{m.value2:g}" if m.value2 is not None else f"{m.value:g}"
    return f"{v} {m.unit} ({m.recorded_at:%Y-%m-%d %H:%M} UTC, {m.source})"


def health_summary_markdown(db: Session, user: User, days: int = 90) -> str:
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    p = db.scalar(select(HealthProfile).where(HealthProfile.user_id == user.id))
    out = [
        "# Personal Health Summary",
        f"_Generated {now:%Y-%m-%d %H:%M} UTC by Personal Doctor AI. All information below was entered by the user "
        "and has not been clinically verified. This is not a medical record or diagnosis._",
        "",
        "## Profile",
    ]
    if p:
        age = age_from_dob(p.date_of_birth)
        rows = [("Name", p.full_name), ("Date of birth", p.date_of_birth and f"{p.date_of_birth} (age {age})"),
                ("Sex", p.sex), ("Height", p.height_cm and f"{p.height_cm:g} cm"),
                ("Weight", p.weight_kg and f"{p.weight_kg:g} kg"), ("Blood type", p.blood_type)]
        bmi = calc_bmi(p.height_cm, p.weight_kg)
        if bmi:
            rows.append(("BMI (calculated, screening only)", f"{bmi} kg/m²"))
        out += [f"- **{k}:** {v}" for k, v in rows if v] or ["- No profile details recorded."]
        if p.family_history:
            out += ["", f"**Family history:** {p.family_history}"]
    else:
        out.append("- No profile details recorded.")

    def section(title: str, items: list[str], empty: str) -> None:
        out.extend(["", f"## {title}"] + (items or [f"- {empty}"]))

    conds = list(db.scalars(select(MedicalCondition).where(MedicalCondition.user_id == user.id)))
    section("Medical conditions", [f"- {c.name} — {c.status}" + (f", since {c.diagnosed_on}" if c.diagnosed_on else "")
                                   + (f". {c.notes}" if c.notes else "") for c in conds], "None recorded.")
    alls = list(db.scalars(select(Allergy).where(Allergy.user_id == user.id)))
    section("Allergies", [f"- {a.allergen}" + (f" — reaction: {a.reaction}" if a.reaction else "")
                          + (f" ({a.severity})" if a.severity else "") for a in alls], "None recorded.")
    meds = [m for m in db.scalars(select(Medication).where(Medication.user_id == user.id)) if is_medication_active(m)]
    section("Current medications (as recorded)", [
        "- " + " · ".join(filter(None, [m.name, m.dosage, m.frequency, m.prescriber and f"prescribed by {m.prescriber}"]))
        for m in meds], "None recorded.")
    syms = list(db.scalars(select(Symptom).where(Symptom.user_id == user.id, Symptom.started_at >= since)
                           .order_by(Symptom.started_at.desc())))
    section(f"Symptoms (last {days} days)", [
        f"- {s.started_at:%Y-%m-%d}: **{s.name}** — {s.status}"
        + (f", self-rated severity {s.severity}/10" if s.severity else "")
        + (f", duration {s.duration}" if s.duration else "")
        + (f". {s.description}" if s.description else "") for s in syms], "None recorded.")
    m_items = []
    for t, label in LABELS.items():
        ms = list(db.scalars(select(HealthMeasurement).where(
            HealthMeasurement.user_id == user.id, HealthMeasurement.type == t, HealthMeasurement.recorded_at >= since)
            .order_by(HealthMeasurement.recorded_at.desc()).limit(5)))
        if ms:
            m_items.append(f"- **{label}:** " + "; ".join(_fmt(m) for m in ms))
    section(f"Recent measurements (last {days} days, up to 5 each)", m_items, "None recorded.")
    appts = list(db.scalars(select(Appointment).where(Appointment.user_id == user.id, Appointment.scheduled_at >= now,
                                                     Appointment.status == "scheduled").order_by(Appointment.scheduled_at)))
    a_items = []
    for a in appts:
        a_items.append(f"- {a.scheduled_at:%Y-%m-%d %H:%M} UTC — {a.title}" + (f" with {a.provider}" if a.provider else ""))
        a_items += [f"  - Question: {q}" for q in a.questions]
    section("Upcoming appointments & questions", a_items, "None scheduled.")
    convs = list(db.scalars(select(Conversation).where(Conversation.user_id == user.id, Conversation.summary.is_not(None))
                            .order_by(Conversation.updated_at.desc()).limit(5)))
    if convs:
        section("AI conversation summaries (AI-generated, for reference only)",
                [f"- **{c.title}** ({c.updated_at:%Y-%m-%d}):\n{c.summary}" for c in convs], "")
    return "\n".join(out) + "\n"


def _row(obj, exclude: set[str] = frozenset()) -> dict:  # noqa: ANN001
    d = {}
    for col in obj.__table__.columns:
        if col.name in exclude:
            continue
        v = getattr(obj, col.name)
        d[col.name] = v.isoformat() if hasattr(v, "isoformat") else v
    return d


def export_all(db: Session, user: User) -> dict:
    """Machine-readable export of everything the user owns (secrets excluded)."""
    def rows(model, exclude=frozenset()):  # noqa: ANN001, ANN202
        return [_row(r, exclude) for r in db.scalars(select(model).where(model.user_id == user.id))]

    ai = db.scalar(select(AISettings).where(AISettings.user_id == user.id))
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "format_version": 1,
        "account": _row(user, {"password_hash"}),
        "health_profile": rows(HealthProfile),
        "medical_conditions": rows(MedicalCondition),
        "allergies": rows(Allergy),
        "medications": rows(Medication),
        "health_measurements": rows(HealthMeasurement),
        "symptoms": rows(Symptom),
        "appointments": rows(Appointment),
        "medical_documents": rows(MedicalDocument, {"stored_filename"}),
        "document_extractions": rows(DocumentExtraction),
        "conversations": rows(Conversation),
        "messages": rows(Message),
        "ai_settings": _row(ai, {"encrypted_api_key", "key_last4"}) if ai else None,
    }
