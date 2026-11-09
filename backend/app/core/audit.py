"""Privacy-conscious audit logging (no health content, no secrets)."""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import AuditLog


def audit(db: Session, user_id: str | None, action: str, resource_type: str | None = None,
          resource_id: str | None = None, success: bool = True) -> None:
    db.add(AuditLog(user_id=user_id, action=action, resource_type=resource_type,
                    resource_id=resource_id, success=success))
