from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import DB, AdminOrDev, Viewer, client_ip
from app.api.devices import driver_http_error
from app.drivers import DriverError, StreamType
from app.media.rtsp_probe import probe_rtsp
from app.models import Camera
from app.schemas import CameraOut, CameraUpdate, PlaybackRequest, StreamKind, StreamOut
from app.services import media
from app.services.audit import audit
from app.services.devices import driver_for

router = APIRouter(prefix="/cameras", tags=["cameras"])


async def _get_camera(db, camera_id: int) -> Camera:
    camera = await db.scalar(select(Camera).options(selectinload(Camera.device)).where(Camera.id == camera_id))
    if camera is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="ไม่พบกล้อง")
    return camera


@router.get("", response_model=list[CameraOut])
async def list_cameras(_: Viewer, db: DB):
    stmt = select(Camera).options(selectinload(Camera.device)).order_by(Camera.device_id, Camera.channel)
    return (await db.scalars(stmt)).all()


@router.patch("/{camera_id}", response_model=CameraOut)
async def update_camera(camera_id: int, body: CameraUpdate, user: AdminOrDev, db: DB, request: Request):
    camera = await _get_camera(db, camera_id)
    changes = body.model_dump(exclude_unset=True)
    for field, value in changes.items():
        setattr(camera, field, value)
    audit(db, action="camera.update", user=user, username="dev" if user is None else "",
          target=f"camera:{camera.id}", detail=changes, ip=client_ip(request))
    await db.commit()
    return camera


_sub_checked: dict[int, bool] = {}  # camera id -> sub stream answers RTSP (checked once per process)


@router.get("/{camera_id}/live", response_model=StreamOut)
async def live(camera_id: int, _: Viewer, db: DB, stream: StreamKind = "sub"):
    """Register the camera in MediaMTX (on demand) and return where the browser plays it.
    Cameras without a sub stream (e.g. Dahua ITC/ALPR behind an NVR) get their main stream instead."""
    camera = await _get_camera(db, camera_id)
    async with driver_for(camera.device) as drv:
        url = drv.authenticated_url(await drv.get_stream_url(camera.channel, StreamType(stream)))
        if stream == "sub":
            if camera.id not in _sub_checked:
                _sub_checked[camera.id] = (await probe_rtsp(url, timeout=4)).ok
            if not _sub_checked[camera.id]:
                stream = "main"
                url = drv.authenticated_url(await drv.get_stream_url(camera.channel, StreamType.MAIN))
    path = media.live_path(camera.id, stream)
    try:
        await media.set_path(path, url)
    except media.MediaServerError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from None
    return StreamOut(path=path, whep_url=media.whep_url(path))


@router.post("/{camera_id}/playback", response_model=StreamOut)
async def playback(camera_id: int, body: PlaybackRequest, user: Viewer, db: DB, request: Request):
    """Replay the NVR's own recording for a time range (times in the NVR's local clock)."""
    camera = await _get_camera(db, camera_id)
    try:
        async with driver_for(camera.device) as drv:
            url = drv.authenticated_url(await drv.get_playback_url(camera.channel, body.start, body.end))
    except DriverError as e:
        raise driver_http_error(e) from None
    path = media.playback_path(camera.id)
    try:
        await media.set_path(path, url)
    except media.MediaServerError as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e)) from None
    # Watching recordings is logged (PDPA).
    audit(db, action="camera.playback", user=user, username="dev" if user is None else "",
          target=f"camera:{camera.id}", detail={"start": body.start.isoformat(), "end": body.end.isoformat()},
          ip=client_ip(request))
    await db.commit()
    return StreamOut(path=path, whep_url=media.whep_url(path))
