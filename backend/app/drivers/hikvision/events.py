"""Parse Hikvision `/ISAPI/Event/notification/alertStream` into NormalizedEvent.

The stream is multipart; each event is an XML document

    <EventNotificationAlert version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
      <ipAddress>192.168.1.113</ipAddress><channelID>1</channelID>
      <dateTime>2026-11-26T14:34:14+07:00</dateTime><activePostCount>1</activePostCount>
      <eventType>VMD</eventType><eventState>active</eventState>
      <eventDescription>Motion alarm</eventDescription>
    </EventNotificationAlert>

Some parts are JPEG pictures (ANPR, face) - they are skipped by scanning for the XML element only.

Seen on DS-2CD2721G0-IZ V5.7.21 (2026-11-26):
- Heartbeat about once a second: eventType=videoloss, eventState=inactive, channelID=1 (not 0),
  activePostCount=1. So every "videoloss inactive" is treated as a heartbeat; the end of a real
  video loss shows up as the "active" posts stopping.
- Motion (VMD) is re-posted as "active" several times per second while it lasts, always with
  activePostCount=1, and no "inactive" is sent at the end. `ActiveDeduplicator` turns that into one
  START per burst.
"""

from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

from app.drivers.base import DriverError
from app.drivers.events import EventAction, EventType, NormalizedEvent
from app.drivers.hikvision.client import parse_xml

_START = b"<EventNotificationAlert"
_END = b"</EventNotificationAlert>"
_MAX_BUFFER = 4_000_000  # a stuck stream (or pictures with no XML) must not grow memory forever

# Hikvision eventType (lower-case) -> (normalized type, is AI)
CODE_MAP: dict[str, tuple[EventType, bool]] = {
    "vmd": (EventType.MOTION, False),
    "linedetection": (EventType.LINE_CROSSING, True),
    "fielddetection": (EventType.INTRUSION, True),
    "regionentrance": (EventType.INTRUSION, True),
    "regionexiting": (EventType.INTRUSION, True),
    "facedetection": (EventType.FACE, True),
    "anpr": (EventType.VEHICLE, True),
    "vehicledetection": (EventType.VEHICLE, True),
    "humandetection": (EventType.HUMAN, True),
    "videoloss": (EventType.VIDEO_LOSS, False),
    "shelteralarm": (EventType.TAMPER, False),
    "tamperdetection": (EventType.TAMPER, False),
    "diskfull": (EventType.DISK_FULL, False),
    "diskerror": (EventType.DISK_ERROR, False),
    "nicbroken": (EventType.NETWORK, False),
    "ipconflict": (EventType.NETWORK, False),
}
DEVICE_LEVEL_CODES = {"diskfull", "diskerror", "nicbroken", "ipconflict"}
_DATA_FIELDS = ("eventDescription", "activePostCount", "ipAddress", "macAddress", "channelName")


async def iter_alert_documents(chunks: AsyncIterator[bytes]) -> AsyncIterator[bytes]:
    """Cut one `<EventNotificationAlert>...</EventNotificationAlert>` document at a time out of the stream."""
    buf = b""
    async for chunk in chunks:
        buf += chunk
        while (end := buf.find(_END)) != -1:
            start = buf.rfind(_START, 0, end)
            if start != -1:
                yield buf[start:end + len(_END)]
            buf = buf[end + len(_END):]
        if len(buf) > _MAX_BUFFER:  # only pictures or garbage since the last event: keep a small tail
            start = buf.rfind(_START)
            buf = buf[start:] if start != -1 and len(buf) - start < _MAX_BUFFER else buf[-len(_START):]


def _parse_time(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        when = datetime.fromisoformat(text.strip())
    except ValueError:
        return None
    return when if when.tzinfo else when.replace(tzinfo=UTC)


def parse_alert(document: bytes, now: datetime | None = None) -> NormalizedEvent | None:
    """One alert document -> NormalizedEvent; None for heartbeats and unreadable parts."""
    try:
        root = parse_xml(document)
    except DriverError:
        return None
    code = (root.findtext("eventType") or "").strip()
    state = (root.findtext("eventState") or "").strip().lower()
    if code.lower() == "videoloss" and state == "inactive":
        return None  # heartbeat (see module docstring)
    channel_text = root.findtext("channelID") or root.findtext("dynChannelID") or "0"
    try:
        channel_no = int(channel_text)
    except ValueError:
        channel_no = 0

    event_type, is_ai = CODE_MAP.get(code.lower(), (EventType.OTHER, False))
    data = {f: v.strip() for f in _DATA_FIELDS if (v := root.findtext(f))}
    if plate := root.findtext("ANPR/licensePlate"):
        data["license_plate"] = plate.strip()

    return NormalizedEvent(
        type=event_type,
        action=EventAction.STOP if state == "inactive" else EventAction.START,
        channel=None if code.lower() in DEVICE_LEVEL_CODES or channel_no <= 0 else channel_no,
        occurred_at=_parse_time(root.findtext("dateTime")) or now or datetime.now(UTC),
        is_ai=is_ai,
        vendor_code=code,
        data=data,
    )


class ActiveDeduplicator:
    """Collapse the repeated "active" posts of one ongoing event into a single START.

    A post for the same (eventType, channel) within `hold` of the previous one continues the burst
    and is dropped; a longer gap starts a new burst. An explicit STOP always passes and ends the burst.
    """

    def __init__(self, hold: timedelta = timedelta(seconds=10)) -> None:
        self._hold = hold
        self._last: dict[tuple[str, int | None], datetime] = {}

    def accept(self, event: NormalizedEvent, now: datetime | None = None) -> bool:
        now = now or datetime.now(UTC)
        key = (event.vendor_code.lower(), event.channel)
        if event.action is EventAction.STOP:
            self._last.pop(key, None)
            return True
        previous = self._last.get(key)
        self._last[key] = now
        return previous is None or now - previous > self._hold
