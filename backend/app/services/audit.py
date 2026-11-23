from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog, User


def audit(
    db: AsyncSession,
    *,
    action: str,
    user: User | None = None,
    username: str = "",
    target: str = "",
    detail: dict | None = None,
    ip: str = "",
) -> None:
    """Queue an audit record in the current transaction; the caller commits."""
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            username=user.username if user else username,
            action=action,
            target=target,
            detail=detail or {},
            ip=ip,
        )
    )
