"""Translate NetSDK alarm callbacks (command + raw payload) into NormalizedEvent.

Two styles of alarm arrive:
- "state array" alarms (e.g. MOTION_ALARM_EX): payload has one byte per channel, 1 = in alarm. They are
  sent whenever any channel changes, so we diff against the previous array to get start/stop per channel.
- "event" alarms (e.g. EVENT_MOTIONDETECT): a C struct describing one event.
"""

import ctypes
from datetime import UTC, datetime

from app.drivers.events import EventAction, EventType, NormalizedEvent

MOTION_ALARM_EX = 0x2102
VIDEOLOST_ALARM_EX = 0x2103
SHELTER_ALARM_EX = 0x2104
DISKFULL_ALARM_EX = 0x2106
DISKERROR_ALARM_EX = 0x2107
EVENT_MOTIONDETECT = 0x218F

STATE_ARRAY_ALARMS: dict[int, EventType] = {
    MOTION_ALARM_EX: EventType.MOTION,
    VIDEOLOST_ALARM_EX: EventType.VIDEO_LOSS,
    SHELTER_ALARM_EX: EventType.TAMPER,
}

_ACTIONS = {0: EventAction.PULSE, 1: EventAction.START, 2: EventAction.STOP}


def _parse_motion_struct(payload: bytes) -> tuple[int, int] | None:
    """(0-based channel, action) from ALARM_MOTIONDETECT_INFO, using the SDK's own struct layout."""
    try:
        from NetSDK.SDK_Struct import ALARM_MOTIONDETECT_INFO
    except ImportError:
        return None
    size = ctypes.sizeof(ALARM_MOTIONDETECT_INFO)
    if len(payload) < size:
        return None
    info = ALARM_MOTIONDETECT_INFO.from_buffer_copy(payload[:size])
    return info.nChannelID, info.nEventAction


class SdkAlarmTranslator:
    """Stateful: one instance per device subscription."""

    def __init__(self) -> None:
        self._last_state: dict[int, bytes] = {}

    def translate(self, command: int, payload: bytes, now: datetime | None = None) -> list[NormalizedEvent]:
        now = now or datetime.now(UTC)
        code = f"sdk:0x{command:x}"

        def event(type_: EventType, action: EventAction, channel: int | None, data: dict | None = None):
            return NormalizedEvent(type=type_, action=action, channel=channel, occurred_at=now,
                                   is_ai=False, vendor_code=code, data=data or {})

        if command in STATE_ARRAY_ALARMS:
            previous = self._last_state.get(command, bytes(len(payload)))
            self._last_state[command] = payload
            events = []
            for index, state in enumerate(payload):
                was = previous[index] if index < len(previous) else 0
                if bool(state) != bool(was):
                    action = EventAction.START if state else EventAction.STOP
                    events.append(event(STATE_ARRAY_ALARMS[command], action, index + 1))
            return events

        if command == EVENT_MOTIONDETECT:
            parsed = _parse_motion_struct(payload)
            if parsed is None:
                return [event(EventType.MOTION, EventAction.PULSE, None)]
            channel, action = parsed
            return [event(EventType.MOTION, _ACTIONS.get(action, EventAction.PULSE), channel + 1)]

        if command == DISKFULL_ALARM_EX:
            return [event(EventType.DISK_FULL, EventAction.START if payload[:1] == b"\x01" else EventAction.STOP, None)]

        if command == DISKERROR_ALARM_EX:
            failed = [i + 1 for i, state in enumerate(payload) if state]
            action = EventAction.START if failed else EventAction.STOP
            return [event(EventType.DISK_ERROR, action, None, {"disks": failed})]

        # Not mapped yet (AI events come through a different SDK API - Phase 3). Keep it visible for analysis.
        return [event(EventType.OTHER, EventAction.PULSE, None, {"payload_size": len(payload)})]
