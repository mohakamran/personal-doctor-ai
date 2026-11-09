from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.database.base import utcnow
from app.models import Medication
from app.repositories import medications_repo
from app.schemas.common import OkResponse
from app.schemas.health import MedicationIn, MedicationOut
from app.services.health_service import is_medication_active

router = APIRouter(prefix="/medications", tags=["medications"])


def _out(m: Medication) -> MedicationOut:
    o = MedicationOut.model_validate(m)
    o.is_active = is_medication_active(m)
    return o


@router.get("", response_model=list[MedicationOut])
def list_medications(user: CurrentUser, db: DB):
    return [_out(m) for m in medications_repo.list(db, user.id, Medication.created_at.desc())]


@router.post("", response_model=MedicationOut, status_code=201)
def create_medication(body: MedicationIn, user: CurrentUser, db: DB):
    return _out(medications_repo.create(db, user.id, body.model_dump()))


@router.put("/{item_id}", response_model=MedicationOut)
def update_medication(item_id: str, body: MedicationIn, user: CurrentUser, db: DB):
    return _out(medications_repo.update(db, medications_repo.get_owned(db, user.id, item_id), body.model_dump()))


@router.post("/{item_id}/taken", response_model=MedicationOut)
def mark_taken(item_id: str, user: CurrentUser, db: DB):
    """Local reminder tracking: records when the user marked a dose as taken."""
    m = medications_repo.get_owned(db, user.id, item_id)
    m.last_taken_at = utcnow()
    db.flush()
    return _out(m)


@router.delete("/{item_id}", response_model=OkResponse)
def delete_medication(item_id: str, user: CurrentUser, db: DB):
    medications_repo.delete(db, medications_repo.get_owned(db, user.id, item_id))
    return OkResponse()
