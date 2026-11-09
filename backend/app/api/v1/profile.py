"""Health profile, medical conditions and allergies."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.audit import audit
from app.core.deps import DB, CurrentUser
from app.models import Allergy, MedicalCondition
from app.repositories import allergies_repo, conditions_repo
from app.schemas.common import OkResponse
from app.schemas.health import AllergyIn, AllergyOut, ConditionIn, ConditionOut, ProfileIn, ProfileOut
from app.services.health_service import calc_bmi, get_or_create_profile, profile_completion

router = APIRouter(prefix="/profile", tags=["health profile"])


def _profile_out(db, user) -> ProfileOut:  # noqa: ANN001
    p = get_or_create_profile(db, user)
    nc = db.scalar(select(func.count()).select_from(MedicalCondition).where(MedicalCondition.user_id == user.id)) or 0
    na = db.scalar(select(func.count()).select_from(Allergy).where(Allergy.user_id == user.id)) or 0
    out = ProfileOut.model_validate(p)
    out.completion = profile_completion(p, nc, na)
    out.bmi = calc_bmi(p.height_cm, p.weight_kg)
    return out


@router.get("", response_model=ProfileOut)
def get_profile(user: CurrentUser, db: DB):
    return _profile_out(db, user)


@router.put("", response_model=ProfileOut)
def update_profile(body: ProfileIn, user: CurrentUser, db: DB):
    p = get_or_create_profile(db, user)
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    db.flush()
    audit(db, user.id, "profile_updated", "health_profile", p.id)
    return _profile_out(db, user)


@router.get("/conditions", response_model=list[ConditionOut])
def list_conditions(user: CurrentUser, db: DB):
    return conditions_repo.list(db, user.id, MedicalCondition.created_at.desc())


@router.post("/conditions", response_model=ConditionOut, status_code=201)
def create_condition(body: ConditionIn, user: CurrentUser, db: DB):
    return conditions_repo.create(db, user.id, body.model_dump())


@router.put("/conditions/{item_id}", response_model=ConditionOut)
def update_condition(item_id: str, body: ConditionIn, user: CurrentUser, db: DB):
    return conditions_repo.update(db, conditions_repo.get_owned(db, user.id, item_id), body.model_dump())


@router.delete("/conditions/{item_id}", response_model=OkResponse)
def delete_condition(item_id: str, user: CurrentUser, db: DB):
    conditions_repo.delete(db, conditions_repo.get_owned(db, user.id, item_id))
    return OkResponse()


@router.get("/allergies", response_model=list[AllergyOut])
def list_allergies(user: CurrentUser, db: DB):
    return allergies_repo.list(db, user.id, Allergy.created_at.desc())


@router.post("/allergies", response_model=AllergyOut, status_code=201)
def create_allergy(body: AllergyIn, user: CurrentUser, db: DB):
    return allergies_repo.create(db, user.id, body.model_dump())


@router.put("/allergies/{item_id}", response_model=AllergyOut)
def update_allergy(item_id: str, body: AllergyIn, user: CurrentUser, db: DB):
    return allergies_repo.update(db, allergies_repo.get_owned(db, user.id, item_id), body.model_dump())


@router.delete("/allergies/{item_id}", response_model=OkResponse)
def delete_allergy(item_id: str, user: CurrentUser, db: DB):
    allergies_repo.delete(db, allergies_repo.get_owned(db, user.id, item_id))
    return OkResponse()
