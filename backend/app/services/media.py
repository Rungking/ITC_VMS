"""MediaMTX paths for live view and NVR playback.

The browser never talks to cameras: the backend registers a path in MediaMTX whose source is the
device's RTSP URL (credentials included, kept inside MediaMTX), and the browser plays that path over
WebRTC (WHEP). Paths are on-demand: MediaMTX connects to the device only while someone is watching.
"""

import httpx

from app.core.config import get_settings


class MediaServerError(Exception):
    pass


def live_path(camera_id: int, stream: str) -> str:
    return f"cam{camera_id}_{stream}"


def playback_path(camera_id: int) -> str:
    return f"pb{camera_id}"  # one playback per camera at a time; a new request replaces it


def whep_url(path: str) -> str:
    return f"{get_settings().mediamtx_webrtc_url.rstrip('/')}/{path}/whep"


async def set_path(path: str, source_url: str, transport: httpx.AsyncBaseTransport | None = None) -> None:
    """Create or replace an on-demand pull path in MediaMTX."""
    config = {
        "source": source_url,
        "sourceOnDemand": True,
        "sourceOnDemandCloseAfter": "10s",
        "rtspTransport": "tcp",
    }
    async with httpx.AsyncClient(base_url=get_settings().mediamtx_api_url, timeout=5, transport=transport) as c:
        try:
            r = await c.post(f"/v3/config/paths/replace/{path}", json=config)
        except httpx.TransportError as e:
            raise MediaServerError(f"ติดต่อ MediaMTX ไม่ได้ ({e.__class__.__name__}) - เปิด MediaMTX หรือยัง?") from e
    if r.status_code >= 400:
        raise MediaServerError(f"MediaMTX ไม่รับ path {path}: HTTP {r.status_code} {r.text[:200]}")
