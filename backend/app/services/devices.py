"""Adding devices and talking to them through their driver."""

import logging
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_secret, encrypt_secret
from app.core.enums import DeviceKind, Vendor
from app.drivers import ConnectionParams, DeviceDriver, create_driver
from app.models import Camera, Device

log = logging.getLogger(__name__)


class DeviceExistsError(Exception):
    pass


def connection_params(device: Device) -> ConnectionParams:
    return ConnectionParams(
        host=device.host,
        username=device.username,
        password=decrypt_secret(device.password_encrypted),
        http_port=device.http_port,
        rtsp_port=device.rtsp_port,
        use_https=device.use_https,
    )


def driver_for(device: Device) -> DeviceDriver:
    """Use as `async with driver_for(device) as drv:` so its connections are closed."""
    return create_driver(device.vendor, connection_params(device))


async def add_device(
    db: AsyncSession,
    *,
    name: str,
    vendor: Vendor,
    host: str,
    username: str,
    password: str,
    http_port: int = 80,
    rtsp_port: int = 554,
    use_https: bool = False,
) -> Device:
    """Log in to the device, read its model and channels, and store it with one Camera per channel
    that has a camera behind it. Raises DriverError (bad password, unreachable, ...) before saving anything."""
    if await db.scalar(select(Device.id).where(Device.host == host, Device.http_port == http_port)):
        raise DeviceExistsError(f"อุปกรณ์ {host}:{http_port} มีอยู่ในระบบแล้ว")

    params = ConnectionParams(host=host, username=username, password=password, http_port=http_port,
                              rtsp_port=rtsp_port, use_https=use_https)
    async with create_driver(vendor, params) as drv:
        info = await drv.get_device_info()
        channels = await drv.list_channels()

    device = Device(
        name=name or info.model or host,
        vendor=vendor,
        kind=info.kind,
        host=host,
        http_port=http_port,
        rtsp_port=rtsp_port,
        use_https=use_https,
        username=username,
        password_encrypted=encrypt_secret(password),
        model=info.model,
        serial=info.serial,
        firmware=info.firmware,
        is_online=True,
        last_seen_at=datetime.now(UTC),
    )
    # A physical camera is stored once: if another NVR already records it (same IP), skip this channel.
    known = set(await db.scalars(select(Camera.remote_address).where(Camera.remote_address != "")))
    device.cameras = []
    for ch in channels:
        if ch.connected is False:  # NVR slot with no camera
            continue
        address = ch.remote_address or ("" if info.kind == DeviceKind.NVR else host)
        if address and address in known:
            log.info("%s ch%d: camera %s already in the system through another device - skipped",
                     host, ch.channel, address)
            continue
        known.add(address)
        device.cameras.append(Camera(channel=ch.channel, name=ch.name, enabled=True, remote_address=address))
    db.add(device)
    await db.flush()
    return device
