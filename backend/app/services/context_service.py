"""Builds the minimal, relevant, user-authorized health context sent to the AI.

The full database is never sent. We include:
- always (if context is enabled): basic profile facts, allergies, active conditions, active medications
  (these are safety-relevant for almost any health question);
- symptoms: recent/ongoing ones, plus older ones whose names appear in the question;
- measurements: the latest value per type, plus a short history for types the question mentions;
- previous conversation summaries only if the user enabled that separately.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Allergy, Conversation, HealthMeasurement, HealthProfile, MedicalCondition, Medication, Symptom, User,
)
from app.services.health_service import age_from_dob, calc_bmi, is_medication_active

MEASUREMENT_KEYWORDS = {
    "weight": ["weight", "weigh", "kg", "pounds", "lose", "gain", "obes", "bmi"],
    "blood_pressure": ["blood pressure", "bp", "hypertension", "hypotension", "systolic", "diastolic"],
    "heart_rate": ["heart rate", "pulse", "palpitation", "bpm", "heartbeat", "racing heart"],
    "blood_glucose": ["glucose", "sugar", "diabet", "a1c", "insulin"],
    "sleep": ["sleep", "insomnia", "tired", "fatigue", "rest"],
    "water": ["water", "hydrat", "thirst", "dehydrat"],
    "bmi": ["bmi", "body mass"],
}
LABELS = {
    "weight": "Weight", "height": "Height", "bmi": "BMI (recorded)", "blood_pressure": "Blood pressure",
    "heart_rate": "Heart rate", "blood_glucose": "Blood glucose", "sleep": "Sleep", "water": "Water intake",
}


@dataclass
class HealthContext:
    text: str = ""
    sections: list[str] = field(default_factory=list)


def _fmt_m(m: HealthMeasurement) -> str:
    val = f"{m.value:g}/{m.value2:g}" if m.type == "blood_pressure" and m.value2 is not None else f"{m.value:g}"
    return f"{val} {m.unit} on {m.recorded_at:%Y-%m-%d}"


def build_context(db: Session, user: User, question: str, include_summaries: bool,
                  exclude_conversation_id: str | None = None) -> HealthContext:
    q = question.lower()
    lines: list[str] = []
    sections: list[str] = []

    profile = db.scalar(select(HealthProfile).where(HealthProfile.user_id == user.id))
    if profile:
        facts = []
        age = age_from_dob(profile.date_of_birth)
        if age is not None:
            facts.append(f"age {age}")
        if profile.sex:
            facts.append(f"sex: {profile.sex}")
        if profile.height_cm:
            facts.append(f"height {profile.height_cm:g} cm")
        if profile.weight_kg:
            facts.append(f"weight {profile.weight_kg:g} kg")
        bmi = calc_bmi(profile.height_cm, profile.weight_kg)
        if bmi:
            facts.append(f"calculated BMI {bmi} (screening figure only)")
        if profile.blood_type:
            facts.append(f"blood type {profile.blood_type}")
        if facts:
            lines.append("Profile: " + ", ".join(facts))
            sections.append("profile")
        if profile.family_history and any(k in q for k in ("family", "genetic", "hereditary", "inherit", "risk")):
            lines.append(f"Family history (user-reported): {profile.family_history[:500]}")
            sections.append("family_history")

    allergies = list(db.scalars(select(Allergy).where(Allergy.user_id == user.id)))
    if allergies:
        lines.append("Allergies: " + "; ".join(
            f"{a.allergen}" + (f" (reaction: {a.reaction})" if a.reaction else "")
            + (f" [{a.severity}]" if a.severity else "") for a in allergies[:20]))
        sections.append("allergies")

    conditions = list(db.scalars(select(MedicalCondition).where(
        MedicalCondition.user_id == user.id, MedicalCondition.status != "resolved")))
    if conditions:
        lines.append("Existing conditions: " + "; ".join(
            c.name + (f" (since {c.diagnosed_on})" if c.diagnosed_on else "") for c in conditions[:20]))
        sections.append("conditions")

    meds = [m for m in db.scalars(select(Medication).where(Medication.user_id == user.id)) if is_medication_active(m)]
    if meds:
        lines.append("Current medications (as recorded by the user): " + "; ".join(
            " ".join(filter(None, [m.name, m.dosage, m.frequency])) for m in meds[:20]))
        sections.append("medications")

    since = datetime.now(timezone.utc) - timedelta(days=30)
    symptoms = list(db.scalars(select(Symptom).where(Symptom.user_id == user.id)
                               .order_by(Symptom.started_at.desc()).limit(100)))
    relevant = [s for s in symptoms
                if s.status != "resolved" or s.started_at >= since or s.name.lower() in q][:8]
    if relevant:
        lines.append("Symptom journal (user-reported):")
        for s in relevant:
            parts = [f"- {s.name}", f"started {s.started_at:%Y-%m-%d}", f"status {s.status}"]
            if s.severity:
                parts.append(f"self-rated severity {s.severity}/10")
            if s.duration:
                parts.append(f"duration {s.duration}")
            if s.associated_symptoms:
                parts.append("with " + ", ".join(s.associated_symptoms[:5]))
            lines.append(", ".join(parts))
        sections.append("symptoms")

    mentioned = {t for t, kws in MEASUREMENT_KEYWORDS.items() if any(re.search(r"\b" + re.escape(k), q) for k in kws)}
    m_lines = []
    for mtype, label in LABELS.items():
        limit = 5 if mtype in mentioned else 1
        rows = list(db.scalars(select(HealthMeasurement).where(
            HealthMeasurement.user_id == user.id, HealthMeasurement.type == mtype)
            .order_by(HealthMeasurement.recorded_at.desc()).limit(limit)))
        if rows:
            m_lines.append(f"- {label}: " + "; ".join(_fmt_m(r) for r in rows))
    if m_lines:
        lines.append("Measurements (user-entered, most recent first):")
        lines.extend(m_lines)
        sections.append("measurements")

    if include_summaries:
        convs = list(db.scalars(select(Conversation).where(
            Conversation.user_id == user.id, Conversation.summary.is_not(None),
            Conversation.id != (exclude_conversation_id or ""))
            .order_by(Conversation.updated_at.desc()).limit(3)))
        if convs:
            lines.append("Summaries of previous conversations:")
            lines.extend(f"- ({c.updated_at:%Y-%m-%d}) {c.summary[:400]}" for c in convs)
            sections.append("conversation_summaries")

    return HealthContext(text="\n".join(lines), sections=sections)
