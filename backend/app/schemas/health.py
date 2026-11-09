from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.common import OptStr, OptUTCDatetime, ORMModel, UTCDatetime

BLOOD_TYPES = {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}


class ProfileIn(BaseModel):
    full_name: OptStr = Field(default=None, max_length=160)
    date_of_birth: date | None = None
    sex: OptStr = Field(default=None, max_length=30)
    height_cm: float | None = Field(default=None, gt=30, lt=275)
    weight_kg: float | None = Field(default=None, gt=1, lt=500)
    blood_type: OptStr = None
    family_history: OptStr = Field(default=None, max_length=4000)
    emergency_contact_name: OptStr = Field(default=None, max_length=160)
    emergency_contact_phone: OptStr = Field(default=None, max_length=40, pattern=r"^[0-9+()\- .]*$")
    emergency_contact_relation: OptStr = Field(default=None, max_length=80)

    @field_validator("date_of_birth")
    @classmethod
    def _dob(cls, v: date | None) -> date | None:
        if v and (v > date.today() or v.year < 1900):
            raise ValueError("Date of birth must be in the past.")
        return v

    @field_validator("blood_type")
    @classmethod
    def _bt(cls, v: str | None) -> str | None:
        if v and v not in BLOOD_TYPES:
            raise ValueError("Unknown blood type.")
        return v


class ProfileOut(ORMModel):
    full_name: str | None = None
    date_of_birth: date | None = None
    sex: str | None = None
    height_cm: float | None = None
    weight_kg: float | None = None
    blood_type: str | None = None
    family_history: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None
    completion: int = 0
    bmi: float | None = None
    updated_at: datetime | None = None


class ConditionIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    diagnosed_on: date | None = None
    status: Literal["active", "managed", "resolved"] = "active"
    notes: OptStr = Field(default=None, max_length=2000)


class ConditionOut(ORMModel):
    id: str
    name: str
    diagnosed_on: date | None
    status: str
    notes: str | None
    created_at: datetime


class AllergyIn(BaseModel):
    allergen: str = Field(min_length=1, max_length=200)
    reaction: OptStr = Field(default=None, max_length=300)
    severity: Literal["mild", "moderate", "severe", "unknown"] | None = None
    notes: OptStr = Field(default=None, max_length=2000)


class AllergyOut(ORMModel):
    id: str
    allergen: str
    reaction: str | None
    severity: str | None
    notes: str | None
    created_at: datetime


MeasurementType = Literal[
    "weight", "height", "bmi", "blood_pressure", "heart_rate", "blood_glucose", "sleep", "water"
]

ALLOWED_UNITS: dict[str, set[str]] = {
    "weight": {"kg", "lb"},
    "height": {"cm", "in"},
    "bmi": {"kg/m2"},
    "blood_pressure": {"mmHg"},
    "heart_rate": {"bpm"},
    "blood_glucose": {"mg/dL", "mmol/L"},
    "sleep": {"hours"},
    "water": {"ml", "L", "fl oz"},
}

# Broad plausibility ranges (validation only — NOT clinical reference ranges).
PLAUSIBLE: dict[tuple[str, str], tuple[float, float]] = {
    ("weight", "kg"): (1, 500), ("weight", "lb"): (2, 1100),
    ("height", "cm"): (30, 275), ("height", "in"): (12, 108),
    ("bmi", "kg/m2"): (5, 100),
    ("blood_pressure", "mmHg"): (40, 300),
    ("heart_rate", "bpm"): (20, 300),
    ("blood_glucose", "mg/dL"): (10, 1500), ("blood_glucose", "mmol/L"): (0.5, 85),
    ("sleep", "hours"): (0, 24),
    ("water", "ml"): (0, 20000), ("water", "L"): (0, 20), ("water", "fl oz"): (0, 700),
}


class MeasurementIn(BaseModel):
    type: MeasurementType
    value: float
    value2: float | None = None
    unit: str
    recorded_at: UTCDatetime
    source: Literal["manual", "imported", "device"] = "manual"
    notes: OptStr = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _check(self):
        if self.unit not in ALLOWED_UNITS[self.type]:
            raise ValueError(f"Unit '{self.unit}' is not valid for {self.type}. "
                             f"Use one of: {', '.join(sorted(ALLOWED_UNITS[self.type]))}.")
        lo, hi = PLAUSIBLE[(self.type, self.unit)]
        if not (lo <= self.value <= hi):
            raise ValueError(f"Value {self.value} {self.unit} is outside the accepted range ({lo}–{hi}).")
        if self.type == "blood_pressure":
            if self.value2 is None:
                raise ValueError("Diastolic value is required for blood pressure.")
            if not (20 <= self.value2 <= 200) or self.value2 >= self.value:
                raise ValueError("Diastolic must be between 20 and 200 and lower than systolic.")
        elif self.value2 is not None:
            raise ValueError("A second value is only used for blood pressure.")
        from datetime import datetime as _dt, timedelta, timezone
        if self.recorded_at > _dt.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("Recorded time cannot be in the future.")
        return self


class MeasurementOut(ORMModel):
    id: str
    type: str
    value: float
    value2: float | None
    unit: str
    recorded_at: datetime
    source: str
    notes: str | None
    created_at: datetime


class SymptomIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: OptStr = Field(default=None, max_length=4000)
    started_at: UTCDatetime
    duration: OptStr = Field(default=None, max_length=120)
    severity: int | None = Field(default=None, ge=1, le=10)
    associated_symptoms: list[str] = Field(default_factory=list, max_length=20)
    notes: OptStr = Field(default=None, max_length=4000)
    status: Literal["ongoing", "improving", "resolved"] = "ongoing"
    resolved_at: OptUTCDatetime = None

    @field_validator("associated_symptoms")
    @classmethod
    def _assoc(cls, v: list[str]) -> list[str]:
        return [s.strip()[:100] for s in v if s and s.strip()]


class SymptomOut(ORMModel):
    id: str
    name: str
    description: str | None
    started_at: datetime
    duration: str | None
    severity: int | None
    associated_symptoms: list[str]
    notes: str | None
    status: str
    resolved_at: datetime | None
    created_at: datetime


class MedicationIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    dosage: OptStr = Field(default=None, max_length=120)
    frequency: OptStr = Field(default=None, max_length=120)
    instructions: OptStr = Field(default=None, max_length=2000)
    start_date: date | None = None
    end_date: date | None = None
    prescriber: OptStr = Field(default=None, max_length=160)
    notes: OptStr = Field(default=None, max_length=2000)
    reminder_enabled: bool = False
    reminder_times: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("reminder_times")
    @classmethod
    def _times(cls, v: list[str]) -> list[str]:
        import re
        for t in v:
            if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t):
                raise ValueError("Reminder times must use HH:MM (24-hour).")
        return sorted(set(v))

    @model_validator(mode="after")
    def _dates(self):
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date.")
        return self


class MedicationOut(ORMModel):
    id: str
    name: str
    dosage: str | None
    frequency: str | None
    instructions: str | None
    start_date: date | None
    end_date: date | None
    prescriber: str | None
    notes: str | None
    reminder_enabled: bool
    reminder_times: list[str]
    last_taken_at: datetime | None
    is_active: bool = True
    created_at: datetime


class AppointmentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    provider: OptStr = Field(default=None, max_length=160)
    specialty: OptStr = Field(default=None, max_length=120)
    location: OptStr = Field(default=None, max_length=200)
    scheduled_at: UTCDatetime
    status: Literal["scheduled", "completed", "cancelled"] = "scheduled"
    reason: OptStr = Field(default=None, max_length=2000)
    consultation_notes: OptStr = Field(default=None, max_length=8000)
    questions: list[str] = Field(default_factory=list, max_length=50)

    @field_validator("questions")
    @classmethod
    def _q(cls, v: list[str]) -> list[str]:
        return [q.strip()[:500] for q in v if q and q.strip()]


class AppointmentOut(ORMModel):
    id: str
    title: str
    provider: str | None
    specialty: str | None
    location: str | None
    scheduled_at: datetime
    status: str
    reason: str | None
    consultation_notes: str | None
    questions: list[str]
    created_at: datetime
