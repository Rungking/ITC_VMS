from abc import ABC, abstractmethod
from collections.abc import AsyncIterator, Callable
from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import ClassVar, Self
from urllib.parse import quote, urlsplit, urlunsplit

from app.core.enums import DeviceKind, Vendor
from app.drivers.events import NormalizedEvent


class DriverError(Exception):
    """Base error for anything that goes wrong talking to a device."""


class AuthError(DriverError):
    """Wrong username/password, or the account is locked on the device."""


class DeviceUnreachableError(DriverError):
    """Network problem: host down, wrong IP/port, timeout."""


class NotSupportedError(DriverError):
    """The driver or the device model doesn't offer this feature."""


class Capability(StrEnum):
    LIVE = "live"
    SNAPSHOT = "snapshot"
    RECORD_SEARCH = "record_search"
    PLAYBACK = "playback"
    EVENTS = "events"
    AI_EVENTS = "ai_events"
    PTZ = "ptz"


class StreamType(StrEnum):
    MAIN = "main"  # full resolution: full-screen view, recording
    SUB = "sub"  # low resolution: multi-view grid


@dataclass(frozen=True, slots=True)
class ConnectionParams:
    host: str
    username: str
    password: str
    http_port: int = 80
    rtsp_port: int = 554
    sdk_port: int = 37777  # vendor private protocol (Dahua NetSDK)
    use_https: bool = False
    timeout: float = 10.0


@dataclass(frozen=True, slots=True)
class DeviceInfo:
    vendor: Vendor
    kind: DeviceKind
    model: str
    serial: str
    firmware: str
    channel_count: int


@dataclass(frozen=True, slots=True)
class ChannelInfo:
    channel: int  # 1-based, same numbering the device shows to users
    name: str
    connected: bool | None = None  # NVR: a camera is configured on this channel (None = unknown)
    remote_address: str = ""  # NVR: IP of the camera behind this channel, if known


@dataclass(frozen=True, slots=True)
class RecordSegment:
    channel: int
    start: datetime
    end: datetime
    trigger: str  # "continuous" | "event" | vendor-specific
    size_bytes: int | None = None


@dataclass(frozen=True, slots=True)
class RtspSource:
    """The media server can pull this URL itself."""

    url: str  # includes credentials - never log it


class PushSource(ABC):
    """Video that only our code can receive (e.g. through a vendor SDK). The media layer feeds the bytes
    to ffmpeg, which re-muxes them (no transcoding) and publishes to the media server."""

    container: ClassVar[str]  # ffmpeg demuxer name for the bytes, e.g. "dhav" for Dahua

    @abstractmethod
    def start(self, on_data: Callable[[bytes], None]) -> None:
        """Start delivering bytes. Blocking call; `on_data` runs on a vendor thread and must not block."""

    @abstractmethod
    def stop(self) -> None: ...


LiveSource = RtspSource | PushSource


class DeviceDriver(ABC):
    """The one interface the rest of the system uses to talk to cameras and NVRs.

    Use as an async context manager so network connections get closed:

        async with create_driver(Vendor.DAHUA, params) as drv:
            info = await drv.get_device_info()
    """

    vendor: ClassVar[Vendor]
    capabilities: ClassVar[frozenset[Capability]]

    def __init__(self, params: ConnectionParams) -> None:
        self.params = params

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:  # noqa: B027 - optional hook
        """Release network resources."""

    # --- required -------------------------------------------------------
    @abstractmethod
    async def get_device_info(self) -> DeviceInfo: ...

    @abstractmethod
    async def list_channels(self) -> list[ChannelInfo]: ...

    @abstractmethod
    async def get_stream_url(self, channel: int, stream: StreamType = StreamType.SUB) -> str:
        """RTSP URL without credentials; see `authenticated_url` before handing it to the media server."""

    @abstractmethod
    async def get_snapshot(self, channel: int) -> bytes:
        """Current frame as JPEG bytes."""

    @abstractmethod
    def subscribe_events(self) -> AsyncIterator[NormalizedEvent]:
        """Long-lived stream of events. Ends (or raises DriverError) when the connection drops;
        the caller is responsible for reconnecting."""

    async def live_source(self, channel: int, stream: StreamType = StreamType.SUB) -> LiveSource:
        """Where the media server gets live video. Default: pull the RTSP URL directly."""
        return RtspSource(self.authenticated_url(await self.get_stream_url(channel, stream)))

    # --- optional (later phases) ----------------------------------------
    async def search_recordings(self, channel: int, start: datetime, end: datetime) -> list[RecordSegment]:
        raise NotSupportedError(f"{self.vendor} driver: recording search not implemented")

    async def get_playback_url(self, channel: int, start: datetime, end: datetime) -> str:
        """RTSP URL (no credentials) that replays the device's own recording from `start` to `end`.
        Naive datetimes are the device's local clock; aware ones are converted to this server's local time
        (assumes server and device share a timezone)."""
        raise NotSupportedError(f"{self.vendor} driver: playback not implemented")

    # --- helpers --------------------------------------------------------
    @staticmethod
    def device_local(when: datetime) -> datetime:
        """Recording times on NVRs are in the device's local clock, without a timezone."""
        return when.astimezone().replace(tzinfo=None) if when.tzinfo else when

    def authenticated_url(self, url: str) -> str:
        """Insert this device's credentials into an rtsp:// URL (for the media server only - never log it)."""
        parts = urlsplit(url)
        userinfo = f"{quote(self.params.username, safe='')}:{quote(self.params.password, safe='')}"
        return urlunsplit(parts._replace(netloc=f"{userinfo}@{parts.hostname}:{parts.port or self.params.rtsp_port}"))
