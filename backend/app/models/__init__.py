"""SQLAlchemy ORM models. Every health record is owned by exactly one user."""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, IdMixin, TimestampMixin, UTCDateTime, utcnow

OWNER_FK = dict(ondelete="CASCADE")


class User(IdMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    unit_system: Mapped[str] = mapped_column(String(10), default="metric", nullable=False)
    country_code: Mapped[str | None] = mapped_column(String(2))
    emergency_number: Mapped[str | None] = mapped_column(String(20))
    last_login_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    profile: Mapped["HealthProfile | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )
    ai_settings: Mapped["AISettings | None"] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )


class HealthProfile(IdMixin, TimestampMixin, Base):
    __tablename__ = "health_profiles"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), unique=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(160))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    sex: Mapped[str | None] = mapped_column(String(30))
    height_cm: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)
    blood_type: Mapped[str | None] = mapped_column(String(5))
    family_history: Mapped[str | None] = mapped_column(Text)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(160))
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(40))
    emergency_contact_relation: Mapped[str | None] = mapped_column(String(80))

    user: Mapped[User] = relationship(back_populates="profile")


class MedicalCondition(IdMixin, TimestampMixin, Base):
    __tablename__ = "medical_conditions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    diagnosed_on: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="active", nullable=False)  # active|resolved|managed
    notes: Mapped[str | None] = mapped_column(Text)


class Allergy(IdMixin, TimestampMixin, Base):
    __tablename__ = "allergies"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    allergen: Mapped[str] = mapped_column(String(200), nullable=False)
    reaction: Mapped[str | None] = mapped_column(String(300))
    severity: Mapped[str | None] = mapped_column(String(20))  # mild|moderate|severe|unknown (user-reported)
    notes: Mapped[str | None] = mapped_column(Text)


class Medication(IdMixin, TimestampMixin, Base):
    __tablename__ = "medications"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    dosage: Mapped[str | None] = mapped_column(String(120))
    frequency: Mapped[str | None] = mapped_column(String(120))
    instructions: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[date | None] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    prescriber: Mapped[str | None] = mapped_column(String(160))
    notes: Mapped[str | None] = mapped_column(Text)
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_times: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    last_taken_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class HealthMeasurement(IdMixin, TimestampMixin, Base):
    __tablename__ = "health_measurements"
    __table_args__ = (Index("ix_measurements_user_type_time", "user_id", "type", "recorded_at"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    value2: Mapped[float | None] = mapped_column(Float)  # diastolic for blood pressure
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, default=utcnow)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)


class Symptom(IdMixin, TimestampMixin, Base):
    __tablename__ = "symptoms"
    __table_args__ = (Index("ix_symptoms_user_started", "user_id", "started_at"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    duration: Mapped[str | None] = mapped_column(String(120))
    severity: Mapped[int | None] = mapped_column(Integer)  # user-reported 1-10
    associated_symptoms: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="ongoing", nullable=False)  # ongoing|improving|resolved
    resolved_at: Mapped[datetime | None] = mapped_column(UTCDateTime())


class MedicalDocument(IdMixin, TimestampMixin, Base):
    __tablename__ = "medical_documents"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_filename: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(80), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    category: Mapped[str] = mapped_column(String(40), default="other", nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    report_date: Mapped[date | None] = mapped_column(Date)

    extraction: Mapped["DocumentExtraction | None"] = relationship(
        back_populates="document", cascade="all, delete-orphan", passive_deletes=True, uselist=False
    )


class DocumentExtraction(IdMixin, TimestampMixin, Base):
    __tablename__ = "document_extractions"

    document_id: Mapped[str] = mapped_column(
        ForeignKey("medical_documents.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # success|empty|failed
    method: Mapped[str] = mapped_column(String(20), default="pymupdf", nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    text: Mapped[str] = mapped_column(Text, default="", nullable=False)
    lab_lines: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    error: Mapped[str | None] = mapped_column(String(300))
    ai_explanation: Mapped[str | None] = mapped_column(Text)
    ai_model: Mapped[str | None] = mapped_column(String(80))
    explained_at: Mapped[datetime | None] = mapped_column(UTCDateTime())

    document: Mapped[MedicalDocument] = relationship(back_populates="extraction")


class Conversation(IdMixin, TimestampMixin, Base):
    __tablename__ = "conversations"
    __table_args__ = (Index("ix_conversations_user_updated", "user_id", "updated_at"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), default="New conversation", nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    document_id: Mapped[str | None] = mapped_column(ForeignKey("medical_documents.id", ondelete="SET NULL"))
    use_health_context: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    messages: Mapped[list["Message"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", passive_deletes=True,
        order_by="Message.created_at",
    )


class Message(IdMixin, Base):
    __tablename__ = "messages"
    __table_args__ = (Index("ix_messages_conv_created", "conversation_id", "created_at"),)

    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user|assistant|system_notice
    content: Mapped[str] = mapped_column(Text, nullable=False)
    safety_flag: Mapped[str | None] = mapped_column(String(40))
    model: Mapped[str | None] = mapped_column(String(80))
    context_used: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class Appointment(IdMixin, TimestampMixin, Base):
    __tablename__ = "appointments"
    __table_args__ = (Index("ix_appointments_user_time", "user_id", "scheduled_at"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    provider: Mapped[str | None] = mapped_column(String(160))
    specialty: Mapped[str | None] = mapped_column(String(120))
    location: Mapped[str | None] = mapped_column(String(200))
    scheduled_at: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    consultation_notes: Mapped[str | None] = mapped_column(Text)
    questions: Mapped[list] = mapped_column(JSON, default=list, nullable=False)


class AISettings(IdMixin, TimestampMixin, Base):
    __tablename__ = "ai_settings"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", **OWNER_FK), unique=True, nullable=False)
    provider: Mapped[str] = mapped_column(String(20), default="openai", nullable=False)
    encrypted_api_key: Mapped[str | None] = mapped_column(Text)
    key_last4: Mapped[str | None] = mapped_column(String(8))
    model: Mapped[str | None] = mapped_column(String(80))
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    # Privacy / consent
    ai_consent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ai_consent_at: Mapped[datetime | None] = mapped_column(UTCDateTime())
    use_health_context: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    include_conversation_summaries: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allow_document_ai: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user: Mapped[User] = relationship(back_populates="ai_settings")


class AuditLog(IdMixin, Base):
    """Privacy-conscious audit trail: actions and resource ids only, never health content."""

    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_user_created", "user_id", "created_at"),)

    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    resource_type: Mapped[str | None] = mapped_column(String(40))
    resource_id: Mapped[str | None] = mapped_column(String(36))
    success: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, nullable=False)


__all__ = [
    "User", "HealthProfile", "MedicalCondition", "Allergy", "Medication", "HealthMeasurement",
    "Symptom", "MedicalDocument", "DocumentExtraction", "Conversation", "Message", "Appointment",
    "AISettings", "AuditLog",
]
