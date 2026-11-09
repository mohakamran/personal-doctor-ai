"""Health measurements, analytics, dashboard and downloadable summaries."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse, PlainTextResponse
from sqlalchemy import func, select

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.models import (
    Allergy, Appointment, Conversation, HealthMeasurement, MedicalCondition, MedicalDocument, Medication, Symptom,
)
from app.repositories import measurements_repo
from app.schemas.common import OkResponse
from app.schemas.health import MeasurementIn, MeasurementOut, MeasurementType
from app.services import summary_service
from app.services.chat_service import conversation_out
from app.services.health_service import (
    analytics_series, calc_bmi, get_or_create_profile, is_medication_active, latest_height_cm, latest_weight_kg,
    profile_completion,
)

router = APIRouter(tags=["health"])


@router.get("/measurements", response_model=list[MeasurementOut])
def list_measurements(user: CurrentUser, db: DB, type: MeasurementType | None = None,
                      start: datetime | None = None, end: datetime | None = None,
                      limit: int = Query(500, ge=1, le=5000)):
    filters = []
    if type:
        filters.append(HealthMeasurement.type == type)
    if start:
        filters.append(HealthMeasurement.recorded_at >= start)
    if end:
        filters.append(HealthMeasurement.recorded_at <= end)
    return measurements_repo.list(db, user.id, HealthMeasurement.recorded_at.desc(), filters=filters, limit=limit)


@router.post("/measurements", response_model=MeasurementOut, status_code=201)
def create_measurement(body: MeasurementIn, user: CurrentUser, db: DB):
    m = measurements_repo.create(db, user.id, body.model_dump())
    audit(db, user.id, "measurement_created", "measurement", m.id)
    return m


@router.put("/measurements/{item_id}", response_model=MeasurementOut)
def update_measurement(item_id: str, body: MeasurementIn, user: CurrentUser, db: DB):
    return measurements_repo.update(db, measurements_repo.get_owned(db, user.id, item_id), body.model_dump())


@router.delete("/measurements/{item_id}", response_model=OkResponse)
def delete_measurement(item_id: str, user: CurrentUser, db: DB):
    measurements_repo.delete(db, measurements_repo.get_owned(db, user.id, item_id))
    return OkResponse()


@router.get("/analytics")
def analytics(user: CurrentUser, db: DB, start: datetime | None = None, end: datetime | None = None):
    profile = get_or_create_profile(db, user)
    return analytics_series(db, user.id, start, end, profile)


@router.get("/dashboard")
def dashboard(user: CurrentUser, db: DB):
    """Everything here comes from the user's own records. No sample or generated data."""
    now = datetime.now(timezone.utc)
    profile = get_or_create_profile(db, user)
    n_cond = db.scalar(select(func.count()).select_from(MedicalCondition).where(MedicalCondition.user_id == user.id)) or 0
    n_all = db.scalar(select(func.count()).select_from(Allergy).where(Allergy.user_id == user.id)) or 0

    def latest(t: str, n: int = 1):  # noqa: ANN202
        return list(db.scalars(select(HealthMeasurement).where(HealthMeasurement.user_id == user.id,
                                                               HealthMeasurement.type == t)
                               .order_by(HealthMeasurement.recorded_at.desc()).limit(n)))

    def ser(ms):  # noqa: ANN001, ANN202
        return [MeasurementOut.model_validate(m).model_dump(mode="json") for m in ms]

    height = latest_height_cm(db, user.id, profile)
    weight = latest_weight_kg(db, user.id, profile)
    meds = [m for m in db.scalars(select(Medication).where(Medication.user_id == user.id)) if is_medication_active(m)]
    convs = list(db.scalars(select(Conversation).where(Conversation.user_id == user.id)
                            .order_by(Conversation.updated_at.desc()).limit(5)))
    appts = list(db.scalars(select(Appointment).where(Appointment.user_id == user.id,
                                                      Appointment.status == "scheduled",
                                                      Appointment.scheduled_at >= now)
                            .order_by(Appointment.scheduled_at.asc()).limit(5)))
    symptoms = list(db.scalars(select(Symptom).where(Symptom.user_id == user.id)
                               .order_by(Symptom.started_at.desc()).limit(5)))
    n_docs = db.scalar(select(func.count()).select_from(MedicalDocument).where(MedicalDocument.user_id == user.id)) or 0
    return {
        "display_name": user.display_name,
        "profile_completion": profile_completion(profile, n_cond, n_all),
        "weight_kg": round(weight, 1) if weight else None,
        "height_cm": round(height, 1) if height else None,
        "bmi": calc_bmi(height, weight),
        "latest": {t: ser(latest(t)) for t in ("weight", "blood_pressure", "heart_rate", "blood_glucose", "sleep", "water")},
        "blood_pressure_history": ser(list(reversed(latest("blood_pressure", 14)))),
        "heart_rate_history": ser(list(reversed(latest("heart_rate", 14)))),
        "sleep_history": ser(list(reversed(latest("sleep", 14)))),
        "recent_symptoms": [{"id": s.id, "name": s.name, "severity": s.severity, "status": s.status,
                             "started_at": s.started_at.isoformat()} for s in symptoms],
        "active_medications": [{"id": m.id, "name": m.name, "dosage": m.dosage, "frequency": m.frequency,
                                "reminder_enabled": m.reminder_enabled, "reminder_times": m.reminder_times}
                               for m in meds],
        "recent_conversations": [
            {k: (v.isoformat() if hasattr(v, "isoformat") else v) for k, v in conversation_out(db, c).items()}
            for c in convs],
        "upcoming_appointments": [{"id": a.id, "title": a.title, "provider": a.provider,
                                   "scheduled_at": a.scheduled_at.isoformat(), "location": a.location}
                                  for a in appts],
        "counts": {"conditions": n_cond, "allergies": n_all, "documents": n_docs},
    }


@router.get("/reports/health-summary", response_class=PlainTextResponse)
def health_summary(user: CurrentUser, db: DB, days: int = Query(90, ge=7, le=3650)):
    md = summary_service.health_summary_markdown(db, user, days)
    audit(db, user.id, "summary_downloaded", "user", user.id)
    return PlainTextResponse(md, media_type="text/markdown; charset=utf-8", headers={
        "Content-Disposition": f'attachment; filename="health-summary-{datetime.now(timezone.utc):%Y%m%d}.md"'})


@router.get("/reports/export")
def export_data(user: CurrentUser, db: DB):
    data = summary_service.export_all(db, user)
    audit(db, user.id, "data_exported", "user", user.id)
    return JSONResponse(data, headers={
        "Content-Disposition": f'attachment; filename="personal-doctor-ai-export-{datetime.now(timezone.utc):%Y%m%d}.json"'})
