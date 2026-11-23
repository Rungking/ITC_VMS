from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select

from app.api.deps import DB, CurrentUser, client_ip
from app.core.security import burn_password_check, create_access_token, verify_password
from app.models import User
from app.schemas import TokenOut, UserOut
from app.services.audit import audit

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
async def login(request: Request, form: Annotated[OAuth2PasswordRequestForm, Depends()], db: DB):
    user = await db.scalar(select(User).where(User.username == form.username))
    if user is None:
        burn_password_check(form.password)
        ok = False
    else:
        ok = user.is_active and verify_password(form.password, user.password_hash)

    if not ok:
        audit(db, action="auth.login_failed", username=form.username[:64], ip=client_ip(request))
        await db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")

    audit(db, action="auth.login", user=user, ip=client_ip(request))
    await db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.role), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
