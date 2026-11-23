"""Device drivers: one per vendor API, all behind the same DeviceDriver interface.

Nothing outside this package should know which vendor a device is.
"""

from app.drivers.base import (
    AuthError,
    Capability,
    ChannelInfo,
    ConnectionParams,
    DeviceDriver,
    DeviceInfo,
    DeviceUnreachableError,
    DriverError,
    NotSupportedError,
    RecordSegment,
    StreamType,
)
from app.drivers.events import EventAction, EventType, NormalizedEvent
from app.drivers.registry import create_driver, supported_vendors

__all__ = [
    "AuthError",
    "Capability",
    "ChannelInfo",
    "ConnectionParams",
    "DeviceDriver",
    "DeviceInfo",
    "DeviceUnreachableError",
    "DriverError",
    "EventAction",
    "EventType",
    "NormalizedEvent",
    "NotSupportedError",
    "RecordSegment",
    "StreamType",
    "create_driver",
    "supported_vendors",
]
