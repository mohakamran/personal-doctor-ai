from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DB, CurrentUser
from app.models import Symptom
from app.repositories import symptoms_repo
from app.schemas.common import OkResponse
from app.schemas.health import SymptomIn, SymptomOut

router = APIRouter(prefix="/symptoms", tags=["symptoms"])


def _data(body: SymptomIn) -> dict:
    d = body.model_dump()
    if d["status"] != "resolved":
        d["resolved_at"] = None
    return d


@router.get("", response_model=list[SymptomOut])
def list_symptoms(user: CurrentUser, db: DB):
    return symptoms_repo.list(db, user.id, Symptom.started_at.desc())


@router.post("", response_model=SymptomOut, status_code=201)
def create_symptom(body: SymptomIn, user: CurrentUser, db: DB):
    return symptoms_repo.create(db, user.id, _data(body))


@router.get("/{item_id}", response_model=SymptomOut)
def get_symptom(item_id: str, user: CurrentUser, db: DB):
    return symptoms_repo.get_owned(db, user.id, item_id)


@router.put("/{item_id}", response_model=SymptomOut)
def update_symptom(item_id: str, body: SymptomIn, user: CurrentUser, db: DB):
    return symptoms_repo.update(db, symptoms_repo.get_owned(db, user.id, item_id), _data(body))


@router.delete("/{item_id}", response_model=OkResponse)
def delete_symptom(item_id: str, user: CurrentUser, db: DB):
    symptoms_repo.delete(db, symptoms_repo.get_owned(db, user.id, item_id))
    return OkResponse()
