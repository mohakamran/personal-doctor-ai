from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict


def _strip(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    return v or None


def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v.replace(tzinfo=timezone.utc) if v.tzinfo is None else v.astimezone(timezone.utc)


OptStr = Annotated[str | None, AfterValidator(_strip)]
UTCDatetime = Annotated[datetime, AfterValidator(_aware)]
OptUTCDatetime = Annotated[datetime | None, AfterValidator(_aware)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class OkResponse(BaseModel):
    ok: bool = True
