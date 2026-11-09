"""Health profile, unit conversion, BMI and analytics helpers."""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import HealthMeasurement, HealthProfile, Medication, User

PROFILE_FIELDS = [
    "full_name", "date_of_birth", "sex", "height_cm", "weight_kg", "blood_type",
    "family_history", "emergency_contact_name", "emergency_contact_phone",
]


def get_or_create_profile(db: Session, user: User) -> HealthProfile:
    profile = db.scalar(select(HealthProfile).where(HealthProfile.user_id == user.id))
    if profile is None:
        profile = HealthProfile(user_id=user.id)
        db.add(profile)
        db.flush()
    return profile


def profile_completion(profile: HealthProfile | None, n_conditions: int = 0, n_allergies: int = 0) -> int:
    if profile is None:
        return 0
    filled = sum(1 for f in PROFILE_FIELDS if getattr(profile, f) not in (None, ""))
    # conditions/allergies sections count once each if the user has recorded anything
    total = len(PROFILE_FIELDS) + 2
    filled += (1 if n_conditions else 0) + (1 if n_allergies else 0)
    return round(100 * filled / total)


def calc_bmi(height_cm: float | None, weight_kg: float | None) -> float | None:
    """BMI is only calculated when both values are valid. It is not a diagnosis."""
    if not height_cm or not weight_kg or height_cm < 30 or weight_kg <= 0:
        return None
    m = height_cm / 100
    return round(weight_kg / (m * m), 1)


def age_from_dob(dob: date | None) -> int | None:
    if not dob:
        return None
    t = date.today()
    return t.year - dob.year - ((t.month, t.day) < (dob.month, dob.day))


# --- unit conversion (originals are always preserved in the database) ---
def to_kg(value: float, unit: str) -> float:
    return value * 0.45359237 if unit == "lb" else value


def to_cm(value: float, unit: str) -> float:
    return value * 2.54 if unit == "in" else value


def to_mg_dl(value: float, unit: str) -> float:
    return value * 18.0 if unit == "mmol/L" else value


def to_ml(value: float, unit: str) -> float:
    return {"L": value * 1000, "fl oz": value * 29.5735}.get(unit, value)


CANONICAL = {
    "weight": ("kg", to_kg), "height": ("cm", to_cm), "blood_glucose": ("mg/dL", to_mg_dl),
    "water": ("ml", to_ml),
}


def normalized(m: HealthMeasurement) -> tuple[float, str]:
    if m.type in CANONICAL:
        unit, fn = CANONICAL[m.type]
        return round(fn(m.value, m.unit), 2), unit
    return m.value, m.unit


def latest_height_cm(db: Session, user_id: str, profile: HealthProfile | None) -> float | None:
    m = db.scalar(
        select(HealthMeasurement)
        .where(HealthMeasurement.user_id == user_id, HealthMeasurement.type == "height")
        .order_by(HealthMeasurement.recorded_at.desc()).limit(1)
    )
    if m:
        return to_cm(m.value, m.unit)
    return profile.height_cm if profile else None


def latest_weight_kg(db: Session, user_id: str, profile: HealthProfile | None) -> float | None:
    m = db.scalar(
        select(HealthMeasurement)
        .where(HealthMeasurement.user_id == user_id, HealthMeasurement.type == "weight")
        .order_by(HealthMeasurement.recorded_at.desc()).limit(1)
    )
    if m:
        return to_kg(m.value, m.unit)
    return profile.weight_kg if profile else None


def analytics_series(db: Session, user_id: str, start: datetime | None, end: datetime | None,
                     profile: HealthProfile | None) -> dict:
    stmt = select(HealthMeasurement).where(HealthMeasurement.user_id == user_id)
    if start:
        stmt = stmt.where(HealthMeasurement.recorded_at >= start)
    if end:
        stmt = stmt.where(HealthMeasurement.recorded_at <= end)
    rows = list(db.scalars(stmt.order_by(HealthMeasurement.recorded_at.asc())))

    series: dict[str, list[dict]] = {}
    for m in rows:
        v, unit = normalized(m)
        point = {"id": m.id, "t": m.recorded_at.isoformat(), "value": v, "unit": unit,
                 "original_value": m.value, "original_unit": m.unit}
        if m.type == "blood_pressure":
            point["systolic"] = m.value
            point["diastolic"] = m.value2
        series.setdefault(m.type, []).append(point)

    # Calculated BMI series from weight entries and the latest known height.
    height = latest_height_cm(db, user_id, profile)
    bmi_calc = []
    if height:
        for p in series.get("weight", []):
            b = calc_bmi(height, p["value"])
            if b:
                bmi_calc.append({"t": p["t"], "value": b, "unit": "kg/m2", "calculated": True})
    series["bmi_calculated"] = bmi_calc

    stats = {}
    for k, pts in series.items():
        if not pts:
            continue
        vals = [p["value"] for p in pts]
        stats[k] = {"count": len(vals), "min": min(vals), "max": max(vals),
                    "avg": round(sum(vals) / len(vals), 1), "latest": pts[-1]}
    return {"series": series, "stats": stats, "height_cm_used_for_bmi": height}


def is_medication_active(m: Medication, today: date | None = None) -> bool:
    today = today or datetime.now(timezone.utc).date()
    if m.start_date and m.start_date > today:
        return False
    return not (m.end_date and m.end_date < today)
