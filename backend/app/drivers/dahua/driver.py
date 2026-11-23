import asyncio
import logging
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from enum import StrEnum

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
    LiveSource,
    StreamType,
)
from app.drivers.dahua.client import DahuaClient
from app.drivers.dahua.events import iter_event_blocks, parse_event_block
from app.drivers.events import EventAction, EventType, NormalizedEvent

log = logging.getLogger(__name__)

_CHANNEL_TITLE_RE = re.compile(r"table\.ChannelTitle\[(\d+)\]\.Name")
_REMOTE_RE = re.compile(r"table\.RemoteDevice\.uuid:System_CONFIG_NETCAMERA_INFO_(\d+)\.(Enable|Address)")
_RECORDER_PREFIXES = ("NVR", "XVR", "DVR", "HCVR", "IVSS", "DHI-NVR", "DHI-XVR")
_EVENT_QUEUE_SIZE = 1000


class DahuaMedia(StrEnum):
    """How live video, snapshots and events are obtained. Device info/channels always use the HTTP API."""

    RTSP = "rtsp"  # standard: RTSP + snapshot.cgi + eventManager.cgi
    NETSDK = "netsdk"  # Dahua private protocol (TCP 37777) for firmware whose RTSP doesn't work


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


class DahuaDriver(DeviceDriver):
    vendor = Vendor.DAHUA
    capabilities = frozenset({Capability.LIVE, Capability.SNAPSHOT, Capability.EVENTS, Capability.AI_EVENTS})

    def __init__(
        self,
        params: ConnectionParams,
        transport: httpx.AsyncBaseTransport | None = None,
        media: DahuaMedia = DahuaMedia.RTSP,
    ) -> None:
        super().__init__(params)
        self.media = DahuaMedia(media)
        self._client = DahuaClient(params, transport=transport)
        self._sdk = None  # NetSdkSession, created on first use
        self._sdk_lock = asyncio.Lock()
        self._event_sinks: set = set()  # callables receiving connection-state events from SDK threads

    async def aclose(self) -> None:
        if self._sdk is not None:
            await asyncio.to_thread(self._sdk.logout)
            self._sdk = None
        await self._client.aclose()

    # --- NetSDK session --------------------------------------------------
    async def _sdk_session(self):
        async with self._sdk_lock:
            if self._sdk is None:
                from app.drivers.dahua.netsdk import NetSdkSession  # optional dependency

                p = self.params
                session = await asyncio.to_thread(NetSdkSession, p.host, p.sdk_port, p.username, p.password)
                await asyncio.to_thread(session.login, self._on_sdk_connection)
                self._sdk = session
            return self._sdk

    def _on_sdk_connection(self, connected: bool) -> None:
        """SDK thread: the SDK reconnects by itself; report it as a device-level network event."""
        log.warning("%s NetSDK connection %s", self.params.host, "restored" if connected else "lost")
        event = NormalizedEvent(
            type=EventType.NETWORK, action=EventAction.STOP if connected else EventAction.START, channel=None,
            occurred_at=datetime.now(UTC), is_ai=False, vendor_code="sdk:connection",
        )
        for sink in list(self._event_sinks):
            sink(event)

    # --- device info (HTTP API) --------------------------------------------
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

    # --- media ----------------------------------------------------------
    async def get_stream_url(self, channel: int, stream: StreamType = StreamType.SUB) -> str:
        subtype = 0 if stream is StreamType.MAIN else 1
        return (f"rtsp://{self.params.host}:{self.params.rtsp_port}"
                f"/cam/realmonitor?channel={channel}&subtype={subtype}")

    async def live_source(self, channel: int, stream: StreamType = StreamType.SUB) -> LiveSource:
        if self.media is DahuaMedia.NETSDK:
            from app.drivers.dahua.netsdk import NetSdkLiveSource

            return NetSdkLiveSource(await self._sdk_session(), channel, stream)
        return await super().live_source(channel, stream)

    async def get_snapshot(self, channel: int) -> bytes:
        if self.media is DahuaMedia.NETSDK:
            from app.drivers.dahua.netsdk import NetSdkLiveSource
            from app.media.frame import grab_frame

            session = await self._sdk_session()
            try:
                return await asyncio.to_thread(session.snapshot, channel)
            except DriverError as e:  # old firmware: SDK snapshot unsupported -> take a frame from live video
                log.debug("%s ch%d SDK snapshot failed (%s), grabbing a frame from live video",
                          self.params.host, channel, e)
                return await asyncio.to_thread(grab_frame, NetSdkLiveSource(session, channel, StreamType.SUB))
        return await self._client.get_bytes(f"/cgi-bin/snapshot.cgi?channel={channel}")

    # --- events ---------------------------------------------------------
    def subscribe_events(self) -> AsyncIterator[NormalizedEvent]:
        if self.media is DahuaMedia.NETSDK:
            return self._subscribe_sdk_events()
        return self._subscribe_http_events()

    async def _subscribe_http_events(self) -> AsyncIterator[NormalizedEvent]:
        async with self._client.stream_lines(
            "/cgi-bin/eventManager.cgi?action=attach&codes=[All]&heartbeat=5"
        ) as lines:
            async for block in iter_event_blocks(lines):
                if event := parse_event_block(block):
                    yield event

    async def _subscribe_sdk_events(self) -> AsyncIterator[NormalizedEvent]:
        from app.drivers.dahua.sdk_events import SdkAlarmTranslator

        session = await self._sdk_session()
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[NormalizedEvent] = asyncio.Queue(maxsize=_EVENT_QUEUE_SIZE)
        translator = SdkAlarmTranslator()

        def enqueue(events: list[NormalizedEvent]) -> None:  # event loop thread
            for ev in events:
                try:
                    queue.put_nowait(ev)
                except asyncio.QueueFull:
                    log.warning("%s event queue full - dropping %s", self.params.host, ev.type)

        def on_alarm(command: int, payload: bytes) -> None:  # SDK thread
            loop.call_soon_threadsafe(lambda: enqueue(translator.translate(command, payload)))

        def on_connection_event(event: NormalizedEvent) -> None:  # SDK thread
            loop.call_soon_threadsafe(enqueue, [event])

        self._event_sinks.add(on_connection_event)
        await asyncio.to_thread(session.start_alarms, on_alarm)
        try:
            while True:
                yield await queue.get()
        finally:
            self._event_sinks.discard(on_connection_event)
            await asyncio.to_thread(session.stop_alarms)
