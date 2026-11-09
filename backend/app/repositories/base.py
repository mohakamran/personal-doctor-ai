"""Generic repository that enforces per-user ownership on every query.

Every read/update/delete of a health record goes through `get_owned`, which
filters by BOTH the record id and the authenticated user's id, so changing an
id in a request can never reach another user's data (it simply 404s).
"""
from __future__ import annotations

from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found

T = TypeVar("T")


class OwnedRepository(Generic[T]):
    def __init__(self, model: type[T], label: str) -> None:
        self.model = model
        self.label = label

    def list(self, db: Session, user_id: str, *order_by: Any, filters: list | None = None,
             limit: int | None = None) -> list[T]:
        stmt = select(self.model).where(self.model.user_id == user_id)  # type: ignore[attr-defined]
        for f in filters or []:
            stmt = stmt.where(f)
        if order_by:
            stmt = stmt.order_by(*order_by)
        if limit:
            stmt = stmt.limit(limit)
        return list(db.scalars(stmt))

    def get_owned(self, db: Session, user_id: str, obj_id: str) -> T:
        obj = db.scalar(
            select(self.model).where(self.model.id == obj_id, self.model.user_id == user_id)  # type: ignore[attr-defined]
        )
        if obj is None:
            raise not_found(self.label)
        return obj

    def create(self, db: Session, user_id: str, data: dict) -> T:
        obj = self.model(user_id=user_id, **data)  # type: ignore[call-arg]
        db.add(obj)
        db.flush()
        return obj

    def update(self, db: Session, obj: T, data: dict) -> T:
        for k, v in data.items():
            setattr(obj, k, v)
        db.flush()
        return obj

    def delete(self, db: Session, obj: T) -> None:
        db.delete(obj)
        db.flush()
