from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_db
from app.core.enums import ROLE_LEVEL, Role
from app.core.security import decode_access_token
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

DB = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(token: Annotated[str, Depends(oauth2_scheme)], db: DB) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail="กรุณาเข้าสู่ระบบใหม่",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        user_id = int(decode_access_token(token)["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise unauthorized from None
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise unauthorized
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]

_optional_token = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_viewer(token: Annotated[str | None, Depends(_optional_token)], db: DB) -> User | None:
    """Any logged-in user. With VMS_DEV_NO_AUTH (development only) anonymous access is allowed too."""
    if token:
        return await get_current_user(token, db)
    if get_settings().dev_no_auth:
        return None
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="กรุณาเข้าสู่ระบบ",
                        headers={"WWW-Authenticate": "Bearer"})


Viewer = Annotated[User | None, Depends(get_viewer)]


async def get_admin_or_dev(token: Annotated[str | None, Depends(_optional_token)], db: DB) -> User | None:
    """An admin. With VMS_DEV_NO_AUTH and no token, anonymous (development only)."""
    if not token and get_settings().dev_no_auth:
        return None
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="กรุณาเข้าสู่ระบบ",
                            headers={"WWW-Authenticate": "Bearer"})
    return await require_role(Role.ADMIN)(await get_current_user(token, db))


AdminOrDev = Annotated[User | None, Depends(get_admin_or_dev)]


def require_role(min_role: Role):
    """Dependency: the user's role (read fresh from DB, not the token) must be at least `min_role`."""

    async def dependency(user: CurrentUser) -> User:
        if ROLE_LEVEL[user.role] < ROLE_LEVEL[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="ไม่มีสิทธิ์ใช้งานส่วนนี้")
        return user

    return dependency


AdminUser = Annotated[User, Depends(require_role(Role.ADMIN))]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else ""
