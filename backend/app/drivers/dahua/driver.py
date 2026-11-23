import re
from collections.abc import AsyncIterator

import httpx

from app.core.enums import DeviceKind, Vendor
from app.drivers.base import (
    AuthError,
    Capability,
    ChannelInfo,
    ConnectionParams,
    DeviceDriver,
    DeviceInfo,
    DriverError,
    StreamType,
)
from app.drivers.dahua.client import DahuaClient
from app.drivers.dahua.events import iter_event_blocks, parse_event_block
from app.drivers.events import NormalizedEvent

_CHANNEL_TITLE_RE = re.compile(r"table\.ChannelTitle\[(\d+)\]\.Name")
_REMOTE_RE = re.compile(r"table\.RemoteDevice\.uuid:System_CONFIG_NETCAMERA_INFO_(\d+)\.(Enable|Address)")


def parse_remote_devices(kv: dict[str, str]) -> dict[int, tuple[bool, str]]:
    """NVR RemoteDevice config -> {channel: (enabled, camera_ip)}. NETCAMERA_INFO_N is channel N+1."""
    result: dict[int, list] = {}
    for key, value in kv.items():
        if m := _REMOTE_RE.fullmatch(key):
            entry = result.setdefault(int(m[1]) + 1, [False, ""])
            if m[2] == "Enable":
                entry[0] = value.lower() == "true"
            else:
                entry[1] = value
    return {ch: (enabled, addr) for ch, (enabled, addr) in result.items()}
_RECORDER_PREFIXES = ("NVR", "XVR", "DVR", "HCVR", "IVSS", "DHI-NVR", "DHI-XVR")


class DahuaDriver(DeviceDriver):
    vendor = Vendor.DAHUA
    capabilities = frozenset({Capability.LIVE, Capability.SNAPSHOT, Capability.EVENTS, Capability.AI_EVENTS})

    def __init__(self, params: ConnectionParams, transport: httpx.AsyncBaseTransport | None = None) -> None:
        super().__init__(params)
        self._client = DahuaClient(params, transport=transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def _optional_kv(self, path: str) -> dict[str, str]:
        """For endpoints that some firmware lacks: return {} instead of failing (auth errors still raise)."""
        try:
            return await self._client.get_kv(path)
        except AuthError:
            raise
        except DriverError:
            return {}

    async def get_device_info(self) -> DeviceInfo:
        system = await self._optional_kv("/cgi-bin/magicBox.cgi?action=getSystemInfo")
        device_type = await self._optional_kv("/cgi-bin/magicBox.cgi?action=getDeviceType")
        serial = await self._optional_kv("/cgi-bin/magicBox.cgi?action=getSerialNo")
        software = await self._client.get_kv("/cgi-bin/magicBox.cgi?action=getSoftwareVersion")
        channels = await self.list_channels()

        # Older firmware puts a numeric code in getSystemInfo.deviceType (e.g. "31");
        # getDeviceType has the real model name (e.g. "DHI-NVR5416-16P-4KS2").
        model = device_type.get("type") or system.get("deviceType", "")
        is_recorder = model.upper().startswith(_RECORDER_PREFIXES) or len(channels) > 1
        return DeviceInfo(
            vendor=Vendor.DAHUA,
            kind=DeviceKind.NVR if is_recorder else DeviceKind.CAMERA,
            model=model,
            serial=serial.get("sn") or system.get("serialNumber", ""),
            firmware=software.get("version", ""),
            channel_count=len(channels),
        )

    async def list_channels(self) -> list[ChannelInfo]:
        titles = await self._client.get_kv("/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle")
        remote = parse_remote_devices(
            await self._optional_kv("/cgi-bin/configManager.cgi?action=getConfig&name=RemoteDevice")
        )
        channels = []
        for key, name in titles.items():
            if m := _CHANNEL_TITLE_RE.fullmatch(key):
                number = int(m[1]) + 1
                enabled, address = remote.get(number, (None, ""))
                channels.append(ChannelInfo(channel=number, name=name or f"Channel {number}",
                                            connected=enabled, remote_address=address if enabled else ""))
        return sorted(channels, key=lambda c: c.channel)

    async def get_stream_url(self, channel: int, stream: StreamType = StreamType.SUB) -> str:
        subtype = 0 if stream is StreamType.MAIN else 1
        return (f"rtsp://{self.params.host}:{self.params.rtsp_port}"
                f"/cam/realmonitor?channel={channel}&subtype={subtype}")

    async def get_snapshot(self, channel: int) -> bytes:
        return await self._client.get_bytes(f"/cgi-bin/snapshot.cgi?channel={channel}")

    async def subscribe_events(self) -> AsyncIterator[NormalizedEvent]:
        async with self._client.stream_lines(
            "/cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5"
        ) as lines:
            async for block in iter_event_blocks(lines):
                if event := parse_event_block(block):
                    yield event
