from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import DB, AdminUser, client_ip
from app.core.security import hash_password
from app.models import User
from app.schemas import UserCreate, UserOut, UserUpdate
from app.services.audit import audit

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(_: AdminUser, db: DB):
    return (await db.scalars(select(User).order_by(User.username))).all()


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(body: UserCreate, admin: AdminUser, db: DB, request: Request):
    if await db.scalar(select(User.id).where(User.username == body.username)):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="ชื่อผู้ใช้นี้มีอยู่แล้ว")
    user = User(
        username=body.username,
        full_name=body.full_name,
        role=body.role,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    await db.flush()
    audit(db, action="user.create", user=admin, target=f"user:{user.id}",
          detail={"username": user.username, "role": user.role}, ip=client_ip(request))
    await db.commit()
    return user


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(user_id: int, body: UserUpdate, admin: AdminUser, db: DB, request: Request):
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="ไม่พบผู้ใช้")
    if user.id == admin.id and (body.is_active is False or (body.role and body.role != admin.role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="ไม่สามารถปิดใช้งานหรือลดสิทธิ์บัญชีของตัวเองได้")

    changes = body.model_dump(exclude_unset=True, exclude={"password"})
    for field, value in changes.items():
        setattr(user, field, value)
    if body.password:
        user.password_hash = hash_password(body.password)
        changes["password"] = "changed"

    audit(db, action="user.update", user=admin, target=f"user:{user.id}", detail=changes, ip=client_ip(request))
    await db.commit()
    return user
