import logging

from sqlalchemy import func, select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.enums import Role
from app.core.security import hash_password
from app.models import User

log = logging.getLogger(__name__)


async def ensure_first_admin() -> None:
    """On a fresh install, create the admin from VMS_FIRST_ADMIN_USERNAME/PASSWORD."""
    settings = get_settings()
    if not (settings.first_admin_username and settings.first_admin_password):
        return
    async with SessionLocal() as db:
        if await db.scalar(select(func.count()).select_from(User)):
            return
        db.add(
            User(
                username=settings.first_admin_username,
                full_name="ผู้ดูแลระบบ",
                password_hash=hash_password(settings.first_admin_password),
                role=Role.ADMIN,
            )
        )
        await db.commit()
        log.warning("Created first admin %r - change its password after first login", settings.first_admin_username)
