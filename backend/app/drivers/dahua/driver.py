import re
from collections.abc import AsyncIterator

import httpx

from app.core.enums import DeviceKind, Vendor
from app.drivers.base import (
    Capability,
    ChannelInfo,
    ConnectionParams,
    DeviceDriver,
    DeviceInfo,
    StreamType,
)
from app.drivers.dahua.client import DahuaClient
from app.drivers.dahua.events import iter_event_blocks, parse_event_block
from app.drivers.events import NormalizedEvent

_CHANNEL_TITLE_RE = re.compile(r"table\.ChannelTitle\[(\d+)\]\.Name")
_RECORDER_PREFIXES = ("NVR", "XVR", "DVR", "HCVR", "IVSS", "DHI-NVR", "DHI-XVR")


class DahuaDriver(DeviceDriver):
    vendor = Vendor.DAHUA
    capabilities = frozenset({Capability.LIVE, Capability.SNAPSHOT, Capability.EVENTS, Capability.AI_EVENTS})

    def __init__(self, params: ConnectionParams, transport: httpx.AsyncBaseTransport | None = None) -> None:
        super().__init__(params)
        self._client = DahuaClient(params, transport=transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_device_info(self) -> DeviceInfo:
        system = await self._client.get_kv("/cgi-bin/magicBox.cgi?action=getSystemInfo")
        software = await self._client.get_kv("/cgi-bin/magicBox.cgi?action=getSoftwareVersion")
        channels = await self.list_channels()

        model = system.get("deviceType", "")
        is_recorder = model.upper().startswith(_RECORDER_PREFIXES) or len(channels) > 1
        return DeviceInfo(
            vendor=Vendor.DAHUA,
            kind=DeviceKind.NVR if is_recorder else DeviceKind.CAMERA,
            model=model,
            serial=system.get("serialNumber", ""),
            firmware=software.get("version", ""),
            channel_count=len(channels),
        )

    async def list_channels(self) -> list[ChannelInfo]:
        titles = await self._client.get_kv("/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle")
        channels = []
        for key, name in titles.items():
            if m := _CHANNEL_TITLE_RE.fullmatch(key):
                number = int(m[1]) + 1
                channels.append(ChannelInfo(channel=number, name=name or f"Channel {number}"))
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
