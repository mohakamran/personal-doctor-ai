from app.models import (
    Allergy, Appointment, Conversation, HealthMeasurement, MedicalCondition, MedicalDocument,
    Medication, Symptom,
)
from app.repositories.base import OwnedRepository

conditions_repo = OwnedRepository(MedicalCondition, "Medical condition")
allergies_repo = OwnedRepository(Allergy, "Allergy")
medications_repo = OwnedRepository(Medication, "Medication")
measurements_repo = OwnedRepository(HealthMeasurement, "Measurement")
symptoms_repo = OwnedRepository(Symptom, "Symptom")
documents_repo = OwnedRepository(MedicalDocument, "Document")
conversations_repo = OwnedRepository(Conversation, "Conversation")
appointments_repo = OwnedRepository(Appointment, "Appointment")
