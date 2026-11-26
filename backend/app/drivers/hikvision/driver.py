import logging
from collections.abc import AsyncIterator
from datetime import datetime

import httpx

from app.core.enums import DeviceKind, Vendor
from app.drivers.base import (
    Capability,
    ChannelInfo,
    ConnectionParams,
    DeviceDriver,
    DeviceInfo,
    NotSupportedError,
    StreamType,
)
from app.drivers.events import NormalizedEvent
from app.drivers.hikvision.client import HikvisionClient
from app.drivers.hikvision.events import ActiveDeduplicator, iter_alert_documents, parse_alert

log = logging.getLogger(__name__)

_RECORDER_TYPES = ("NVR", "DVR", "HVR")


def _text(el, path: str) -> str:
    return (el.findtext(path) or "").strip()


def _int(text: str) -> int | None:
    try:
        return int(text)
    except ValueError:
        return None


class HikvisionDriver(DeviceDriver):
    """Hikvision cameras and NVRs through ISAPI.

    Channel numbers follow the device: an NVR's IP channel N is stream N01 (main) / N02 (sub),
    a camera is channel 1 (101/102).
    """

    vendor = Vendor.HIKVISION
    capabilities = frozenset({Capability.LIVE, Capability.SNAPSHOT, Capability.PLAYBACK, Capability.EVENTS,
                              Capability.AI_EVENTS})

    def __init__(self, params: ConnectionParams, transport: httpx.AsyncBaseTransport | None = None) -> None:
        super().__init__(params)
        self._client = HikvisionClient(params, transport=transport)

    async def aclose(self) -> None:
        await self._client.aclose()

    # --- device info ----------------------------------------------------
    async def get_device_info(self) -> DeviceInfo:
        info = await self._client.get_xml("/ISAPI/System/deviceInfo")  # also proves the credentials
        device_type = _text(info, "deviceType")
        if "switch" in device_type.lower():
            # Hikvision PoE switches answer ISAPI too, but they carry no video: they belong in the
            # topology as network nodes (B-04), not behind a video driver.
            raise NotSupportedError(f"{_text(info, 'model')} เป็นสวิตช์เครือข่าย ไม่ใช่กล้องหรือ NVR")
        channels = await self.list_channels()
        firmware = " ".join(filter(None, [_text(info, "firmwareVersion"), _text(info, "firmwareReleasedDate")]))
        is_recorder = device_type.upper().startswith(_RECORDER_TYPES)
        return DeviceInfo(
            vendor=Vendor.HIKVISION,
            kind=DeviceKind.NVR if is_recorder else DeviceKind.CAMERA,
            model=_text(info, "model"),
            serial=_text(info, "serialNumber"),
            firmware=firmware,
            channel_count=len(channels),
        )

    async def list_channels(self) -> list[ChannelInfo]:
        proxy = await self._proxy_channels()
        if proxy is not None:  # NVR: the cameras added to it
            return proxy
        root = await self._client.get_xml("/ISAPI/Streaming/channels")  # camera: its own sensor(s)
        channels = []
        for sc in root.iter("StreamingChannel"):
            stream_id = _int(_text(sc, "id"))
            if stream_id and stream_id % 100 == 1:  # x01 = main stream of channel x
                number = stream_id // 100
                channels.append(ChannelInfo(channel=number, name=_text(sc, "channelName") or f"Channel {number}"))
        return sorted(channels, key=lambda c: c.channel)

    async def _proxy_channels(self) -> list[ChannelInfo] | None:
        """NVR IP channels with their camera address and online state; None when the device is not an NVR."""
        try:
            root = await self._client.get_xml("/ISAPI/ContentMgmt/InputProxy/channels")
        except NotSupportedError:
            return None
        detect: dict[int, str] = {}  # chanDetectResult: "connect", "notExist", offline reasons...
        try:
            status = await self._client.get_xml("/ISAPI/ContentMgmt/InputProxy/channels/status")
            for st in status.iter("InputProxyChannelStatus"):
                if (number := _int(_text(st, "id"))) is not None:
                    detect[number] = _text(st, "chanDetectResult").lower()
        except NotSupportedError:
            pass
        channels = []
        for ch in root.iter("InputProxyChannel"):
            number = _int(_text(ch, "id"))
            if number is None:
                continue
            desc = ch.find("sourceInputPortDescriptor")
            address = _text(desc, "ipAddress") if desc is not None else ""
            # The NVR lists every slot (16 on a 16-ch NVR). Empty PoE slots still carry a reserved address
            # (192.168.254.x, connMode=plugplay) and report chanDetectResult=notExist; a configured camera that
            # is merely offline reports another result and stays in the list.
            if number in detect:
                has_camera = detect[number] not in ("notexist", "")
            else:
                has_camera = bool(_text(desc, "model")) or (bool(address) and _text(desc, "connMode") != "plugplay")
            channels.append(ChannelInfo(
                channel=number,
                name=_text(ch, "name") or f"Channel {number}",
                connected=has_camera,
                remote_address=address if has_camera else "",
            ))
        return sorted(channels, key=lambda c: c.channel)

    # --- media ----------------------------------------------------------
    @staticmethod
    def _stream_id(channel: int, stream: StreamType) -> int:
        return channel * 100 + (1 if stream is StreamType.MAIN else 2)

    async def get_stream_url(self, channel: int, stream: StreamType = StreamType.SUB) -> str:
        return (f"rtsp://{self.params.host}:{self.params.rtsp_port}"
                f"/Streaming/Channels/{self._stream_id(channel, stream)}")

    async def get_playback_url(self, channel: int, start: datetime, end: datetime) -> str:
        # Hikvision writes a trailing "Z" but reads the time as the device's local clock.
        start, end = self.device_local(start), self.device_local(end)
        return (f"rtsp://{self.params.host}:{self.params.rtsp_port}/Streaming/tracks/{channel}01"
                f"?starttime={start:%Y%m%dT%H%M%S}Z&endtime={end:%Y%m%dT%H%M%S}Z")

    async def get_snapshot(self, channel: int) -> bytes:
        return await self._client.get_bytes(
            f"/ISAPI/Streaming/channels/{self._stream_id(channel, StreamType.MAIN)}/picture"
        )

    # --- events ---------------------------------------------------------
    async def subscribe_events(self) -> AsyncIterator[NormalizedEvent]:
        dedup = ActiveDeduplicator()
        async with self._client.stream_bytes("/ISAPI/Event/notification/alertStream") as chunks:
            async for document in iter_alert_documents(chunks):
                if (event := parse_alert(document)) and dedup.accept(event):
                    yield event
