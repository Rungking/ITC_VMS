import pytest
from sqlalchemy import select

from app.api import cameras as cameras_api
from app.core.config import get_settings
from app.core.crypto import decrypt_secret
from app.core.db import SessionLocal
from app.drivers.hikvision import HikvisionDriver
from app.media.rtsp_probe import RtspProbeResult
from app.models import Camera, Device
from app.services import devices as devices_service
from app.services import media
from tests.conftest import auth_headers
from tests.test_hikvision import NVR, fake_device

DEVICE = {"vendor": "hikvision", "host": "10.0.0.9", "username": "admin", "password": "p@ss:word", "name": "NVR lab"}


@pytest.fixture
def fake_hikvision(monkeypatch):
    monkeypatch.setattr(devices_service, "create_driver",
                        lambda vendor, params: HikvisionDriver(params, transport=fake_device(NVR)))


@pytest.fixture
def mediamtx(monkeypatch):
    paths: dict[str, str] = {}

    async def set_path(path, source_url, transport=None):
        paths[path] = source_url

    monkeypatch.setattr(media, "set_path", set_path)
    return paths


@pytest.fixture
def rtsp_ok(monkeypatch):
    """Pretend every RTSP DESCRIBE succeeds unless the URL is listed in `rtsp_ok`."""
    failing: set[str] = set()

    async def probe(url, **_):
        return RtspProbeResult(ok=not any(f in url for f in failing), status="200 OK")

    monkeypatch.setattr(cameras_api, "probe_rtsp", probe)
    monkeypatch.setattr(cameras_api, "_sub_checked", {})
    return failing


@pytest.fixture
async def nvr(client, fake_hikvision):
    """The fake NVR added once through the API; returns its first camera's id."""
    async with SessionLocal() as db:
        cam_id = await db.scalar(select(Camera.id).join(Device).where(Device.host == DEVICE["host"]))
    if cam_id is None:
        r = await client.post("/api/devices", json=DEVICE, headers=await auth_headers(client, "admin"))
        assert r.status_code == 201, r.text
        async with SessionLocal() as db:
            cam_id = await db.scalar(select(Camera.id).join(Device).where(Device.host == DEVICE["host"]))
    return cam_id


async def test_add_device_reads_channels_and_encrypts_password(client, nvr):
    async with SessionLocal() as db:
        device = await db.scalar(select(Device).where(Device.host == DEVICE["host"]))
        cameras = (await db.scalars(select(Camera).where(Camera.device_id == device.id))).all()
    assert (device.model, device.kind) == ("DS-7616NXI-K2/16P(D)", "nvr")
    assert device.password_encrypted != DEVICE["password"]
    assert decrypt_secret(device.password_encrypted) == DEVICE["password"]
    # Fake NVR: ch1 online, ch2 offline-but-configured -> both kept (only channels with no camera are skipped)
    assert [(c.channel, c.name) for c in cameras] == [(1, "Server Rm01"), (2, "Gate")]

    r = await client.post("/api/devices", json=DEVICE, headers=await auth_headers(client, "admin"))
    assert r.status_code == 409


async def test_camera_recorded_by_two_nvrs_is_stored_once(client, nvr):
    # A second NVR that records the same cameras (same IPs) adds no duplicate cameras.
    second = {**DEVICE, "host": "10.0.0.10", "name": "NVR 2"}
    r = await client.post("/api/devices", json=second, headers=await auth_headers(client, "admin"))
    assert r.status_code == 201, r.text
    cameras = (await client.get("/api/cameras", headers=await auth_headers(client, "viewer"))).json()
    addresses = [c["remote_address"] for c in cameras]
    assert sorted(addresses) == ["192.168.254.12", "192.168.254.13"]
    assert {c["device"]["host"] for c in cameras} == {"10.0.0.9"}


async def test_add_device_needs_admin_and_never_returns_password(client, nvr):
    r = await client.post("/api/devices", json=DEVICE, headers=await auth_headers(client, "viewer"))
    assert r.status_code == 403
    r = await client.get("/api/devices", headers=await auth_headers(client, "viewer"))
    assert r.status_code == 200
    assert "password" not in r.text and DEVICE["password"] not in r.text


async def test_camera_list_needs_login_unless_dev_mode(client, nvr):
    assert (await client.get("/api/cameras")).status_code == 401
    r = await client.get("/api/cameras", headers=await auth_headers(client, "viewer"))
    assert r.status_code == 200
    first = r.json()[0]
    assert first["device"]["vendor"] == "hikvision" and first["lat"] is None

    settings = get_settings()
    settings.dev_no_auth = True
    try:
        assert (await client.get("/api/cameras")).status_code == 200
    finally:
        settings.dev_no_auth = False


async def test_update_camera_position_needs_admin(client, nvr):
    body = {"lat": 13.7563, "lng": 100.5018, "location_name": "ห้องเซิร์ฟเวอร์"}
    r = await client.patch(f"/api/cameras/{nvr}", json=body, headers=await auth_headers(client, "viewer"))
    assert r.status_code == 403
    r = await client.patch(f"/api/cameras/{nvr}", json=body, headers=await auth_headers(client, "admin"))
    assert r.status_code == 200
    assert (r.json()["lat"], r.json()["location_name"]) == (13.7563, "ห้องเซิร์ฟเวอร์")


async def test_live_falls_back_to_main_when_there_is_no_sub_stream(client, nvr, mediamtx, rtsp_ok):
    # Like the Dahua ITC/ALPR camera behind the lab NVR: only the main stream exists.
    rtsp_ok.add("/Streaming/Channels/102")
    r = await client.get(f"/api/cameras/{nvr}/live?stream=sub", headers=await auth_headers(client, "viewer"))
    assert r.json()["path"] == f"cam{nvr}_main"
    assert mediamtx[f"cam{nvr}_main"].endswith("/Streaming/Channels/101")


async def test_unreachable_device_is_not_remembered_as_main_only(client, nvr, mediamtx, monkeypatch):
    # Cable unplugged: the probe times out. Use the sub stream path and ask again next time.
    calls = []

    async def probe(url, **_):
        calls.append(url)
        return RtspProbeResult(ok=False, status="timeout")

    monkeypatch.setattr(cameras_api, "probe_rtsp", probe)
    monkeypatch.setattr(cameras_api, "_sub_checked", {})
    for _ in range(2):
        r = await client.get(f"/api/cameras/{nvr}/live?stream=sub", headers=await auth_headers(client, "viewer"))
        assert r.json()["path"] == f"cam{nvr}_sub"
    assert len(calls) == 2


async def test_live_registers_on_demand_path(client, nvr, mediamtx, rtsp_ok):
    r = await client.get(f"/api/cameras/{nvr}/live?stream=sub", headers=await auth_headers(client, "viewer"))
    assert r.status_code == 200
    body = r.json()
    assert body["path"] == f"cam{nvr}_sub"
    assert body["whep_url"] == f"http://127.0.0.1:8889/cam{nvr}_sub/whep"
    # The device password goes to MediaMTX only, never to the browser.
    assert mediamtx[body["path"]] == "rtsp://admin:p%40ss%3Aword@10.0.0.9:554/Streaming/Channels/102"
    assert DEVICE["password"] not in r.text


async def test_playback_uses_nvr_recording_and_is_audited(client, nvr, mediamtx):
    body = {"start": "2026-11-26T09:00:00", "end": "2026-11-26T09:10:00"}
    r = await client.post(f"/api/cameras/{nvr}/playback", json=body, headers=await auth_headers(client, "viewer"))
    assert r.status_code == 200, r.text
    assert mediamtx[f"pb{nvr}"].endswith(
        "/Streaming/tracks/101?starttime=20261126T090000Z&endtime=20261126T091000Z")

    bad = {"start": "2026-11-26T09:00:00", "end": "2026-11-26T08:00:00"}
    r = await client.post(f"/api/cameras/{nvr}/playback", json=bad, headers=await auth_headers(client, "viewer"))
    assert r.status_code == 422
