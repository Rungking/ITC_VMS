"""Parse Dahua `eventManager.cgi?action=attach` output into NormalizedEvent.

The stream is multipart text; each part's body looks like:

    Code=CrossLineDetection;action=Start;index=0;data={ ...JSON, may span lines... }

and `Heartbeat` parts arrive every few seconds.
"""

import json
import re
from collections.abc import AsyncIterator
from datetime import UTC, datetime

from app.drivers.events import EventAction, EventType, NormalizedEvent

_EVENT_RE = re.compile(
    r"Code=(?P<code>[^;]+);action=(?P<action>[^;]+);index=(?P<index>-?\d+)(?:;data=(?P<data>.*))?",
    re.DOTALL,
)

# Dahua code -> (normalized type, is AI)
CODE_MAP: dict[str, tuple[EventType, bool]] = {
    "VideoMotion": (EventType.MOTION, False),
    "SmartMotionHuman": (EventType.HUMAN, True),
    "SmartMotionVehicle": (EventType.VEHICLE, True),
    "CrossLineDetection": (EventType.LINE_CROSSING, True),
    "CrossRegionDetection": (EventType.INTRUSION, True),
    "FaceDetection": (EventType.FACE, True),
    "VideoLoss": (EventType.VIDEO_LOSS, False),
    "VideoBlind": (EventType.TAMPER, False),
    "StorageFailure": (EventType.DISK_ERROR, False),
    "StorageNotExist": (EventType.DISK_ERROR, False),
    "StorageLowSpace": (EventType.DISK_FULL, False),
    "NetAbort": (EventType.NETWORK, False),
}

# Events about the whole device, where `index` is not a camera channel.
DEVICE_LEVEL_CODES = {"StorageFailure", "StorageNotExist", "StorageLowSpace", "NetAbort"}

_ACTIONS = {"Start": EventAction.START, "Stop": EventAction.STOP, "Pulse": EventAction.PULSE}

_HEADER_PREFIXES = ("content-type:", "content-length:")


async def iter_event_blocks(lines: AsyncIterator[str]) -> AsyncIterator[str]:
    """Group raw stream lines into one text block per event."""
    buf: list[str] = []
    async for line in lines:
        s = line.strip()
        is_separator = s.startswith("--") or s == "Heartbeat"
        starts_new_event = s.startswith("Code=")  # some firmware omits boundaries between events
        if (is_separator or starts_new_event) and buf:
            yield "\n".join(buf)
            buf = []
        if is_separator or not s or s.lower().startswith(_HEADER_PREFIXES):
            continue
        buf.append(line)
    if buf:
        yield "\n".join(buf)


def parse_event_block(text: str, now: datetime | None = None) -> NormalizedEvent | None:
    match = _EVENT_RE.search(text.strip())
    if not match:
        return None

    code = match["code"].strip()
    data: dict = {}
    if match["data"]:
        try:
            parsed = json.loads(match["data"].strip())
            data = parsed if isinstance(parsed, dict) else {"value": parsed}
        except ValueError:
            data = {"raw": match["data"].strip()}

    event_type, is_ai = CODE_MAP.get(code, (EventType.OTHER, False))
    index = int(match["index"])
    channel = None if code in DEVICE_LEVEL_CODES or index < 0 else index + 1

    return NormalizedEvent(
        type=event_type,
        action=_ACTIONS.get(match["action"].strip(), EventAction.PULSE),
        channel=channel,
        occurred_at=now or datetime.now(UTC),
        is_ai=is_ai,
        vendor_code=code,
        data=data,
    )
