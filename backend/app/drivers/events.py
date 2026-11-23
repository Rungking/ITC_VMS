from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum


class EventType(StrEnum):
    MOTION = "motion"
    LINE_CROSSING = "line_crossing"  # AI: ข้ามเส้น
    INTRUSION = "intrusion"  # AI: บุกรุกพื้นที่
    HUMAN = "human"  # AI: ตรวจพบคน
    VEHICLE = "vehicle"  # AI: ตรวจพบรถ
    FACE = "face"  # AI: ตรวจพบใบหน้า
    VIDEO_LOSS = "video_loss"
    TAMPER = "tamper"  # ถูกบัง/ถูกปิดกล้อง
    DISK_ERROR = "disk_error"
    DISK_FULL = "disk_full"
    NETWORK = "network"
    OTHER = "other"


class EventAction(StrEnum):
    START = "start"
    STOP = "stop"
    PULSE = "pulse"  # instantaneous, no matching stop


@dataclass(frozen=True, slots=True)
class NormalizedEvent:
    """Vendor-neutral event. Every driver converts its native events into this."""

    type: EventType
    action: EventAction
    channel: int | None  # 1-based; None for device-level events (disk, network)
    occurred_at: datetime
    is_ai: bool
    vendor_code: str  # original code, e.g. Dahua "CrossLineDetection"
    data: dict = field(default_factory=dict)  # vendor payload (object type, rule name, ...)
