from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.api.deps import DB, AdminUser, Viewer, client_ip
from app.drivers import AuthError, DeviceUnreachableError, DriverError
from app.models import Device
from app.schemas import DeviceCreate, DeviceOut
from app.services.audit import audit
from app.services.devices import DeviceExistsError, add_device

router = APIRouter(prefix="/devices", tags=["devices"])


def driver_http_error(e: DriverError) -> HTTPException:
    if isinstance(e, AuthError):
        return HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"อุปกรณ์ไม่ยอมรับการเข้าสู่ระบบ: {e}")
    if isinstance(e, DeviceUnreachableError):
        return HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e))
    return HTTPException(status.HTTP_502_BAD_GATEWAY, detail=f"อุปกรณ์ตอบผิดปกติ: {e}")


@router.get("", response_model=list[DeviceOut])
async def list_devices(_: Viewer, db: DB):
    return (await db.scalars(select(Device).order_by(Device.name))).all()


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def create_device(body: DeviceCreate, admin: AdminUser, db: DB, request: Request):
    """Log in to the device, read its channels and add one camera per channel (the password is stored encrypted)."""
    try:
        device = await add_device(db, **body.model_dump())
    except DeviceExistsError as e:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(e)) from None
    except DriverError as e:
        raise driver_http_error(e) from None
    audit(db, action="device.create", user=admin, target=f"device:{device.id}",
          detail={"host": device.host, "vendor": device.vendor, "model": device.model,
                  "cameras": len(device.cameras)}, ip=client_ip(request))
    await db.commit()
    return device
