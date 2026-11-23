from datetime import UTC, datetime

import pytest

from app.drivers import EventAction, EventType
from app.drivers.dahua.sdk_events import (
    DISKERROR_ALARM_EX,
    EVENT_MOTIONDETECT,
    MOTION_ALARM_EX,
    VIDEOLOST_ALARM_EX,
    SdkAlarmTranslator,
)

NOW = datetime(2026, 11, 23, 12, 0, tzinfo=UTC)


def summary(events):
    return [(e.type, e.action, e.channel) for e in events]


def test_state_array_emits_start_and_stop_per_changed_channel():
    tr = SdkAlarmTranslator()
    assert tr.translate(MOTION_ALARM_EX, bytes(16), NOW) == []  # initial all-clear: nothing to report

    on = bytearray(16)
    on[1] = 1  # channel 2
    assert summary(tr.translate(MOTION_ALARM_EX, bytes(on), NOW)) == [(EventType.MOTION, EventAction.START, 2)]
    assert tr.translate(MOTION_ALARM_EX, bytes(on), NOW) == []  # repeat: no change

    on[4] = 1
    on[1] = 0
    assert summary(tr.translate(MOTION_ALARM_EX, bytes(on), NOW)) == [
        (EventType.MOTION, EventAction.STOP, 2),
        (EventType.MOTION, EventAction.START, 5),
    ]


def test_state_arrays_are_tracked_separately_per_alarm_type():
    tr = SdkAlarmTranslator()
    lost = bytes([0, 1] + [0] * 14)
    tr.translate(MOTION_ALARM_EX, bytes(16), NOW)
    assert summary(tr.translate(VIDEOLOST_ALARM_EX, lost, NOW)) == [(EventType.VIDEO_LOSS, EventAction.START, 2)]


def test_disk_error_lists_failed_disks():
    ev = SdkAlarmTranslator().translate(DISKERROR_ALARM_EX, bytes([0, 1, 0]), NOW)[0]
    assert (ev.type, ev.action, ev.channel, ev.data) == (EventType.DISK_ERROR, EventAction.START, None, {"disks": [2]})


def test_unknown_command_is_kept_as_other():
    ev = SdkAlarmTranslator().translate(0x300C, b"\x00" * 512, NOW)[0]
    assert ev.type is EventType.OTHER
    assert ev.vendor_code == "sdk:0x300c"


def test_motion_detect_struct():
    sdk_struct = pytest.importorskip("NetSDK.SDK_Struct")
    import ctypes

    info = sdk_struct.ALARM_MOTIONDETECT_INFO()
    info.dwSize = ctypes.sizeof(info)
    info.nChannelID = 1
    info.nEventAction = 1
    ev = SdkAlarmTranslator().translate(EVENT_MOTIONDETECT, bytes(info), NOW)[0]
    assert (ev.type, ev.action, ev.channel) == (EventType.MOTION, EventAction.START, 2)
