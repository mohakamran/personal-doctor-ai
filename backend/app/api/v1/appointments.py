from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.models import Appointment
from app.repositories import appointments_repo
from app.schemas.common import OkResponse
from app.schemas.health import AppointmentIn, AppointmentOut

router = APIRouter(prefix="/appointments", tags=["appointments"])


@router.get("", response_model=list[AppointmentOut])
def list_appointments(user: CurrentUser, db: DB):
    return appointments_repo.list(db, user.id, Appointment.scheduled_at.desc())


@router.post("", response_model=AppointmentOut, status_code=201)
def create_appointment(body: AppointmentIn, user: CurrentUser, db: DB):
    return appointments_repo.create(db, user.id, body.model_dump())


@router.put("/{item_id}", response_model=AppointmentOut)
def update_appointment(item_id: str, body: AppointmentIn, user: CurrentUser, db: DB):
    return appointments_repo.update(db, appointments_repo.get_owned(db, user.id, item_id), body.model_dump())


@router.post("/{item_id}/cancel", response_model=AppointmentOut)
def cancel_appointment(item_id: str, user: CurrentUser, db: DB):
    a = appointments_repo.get_owned(db, user.id, item_id)
    a.status = "cancelled"
    db.flush()
    return a


@router.delete("/{item_id}", response_model=OkResponse)
def delete_appointment(item_id: str, user: CurrentUser, db: DB):
    appointments_repo.delete(db, appointments_repo.get_owned(db, user.id, item_id))
    return OkResponse()
