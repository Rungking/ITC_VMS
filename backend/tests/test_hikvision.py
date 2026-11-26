from datetime import UTC, datetime, timedelta

import httpx
import pytest

from app.core.enums import DeviceKind, Vendor
from app.drivers import (
    AuthError,
    ConnectionParams,
    EventAction,
    EventType,
    NotSupportedError,
    StreamType,
    create_driver,
)
from app.drivers.hikvision import HikvisionDriver
from app.drivers.hikvision.events import ActiveDeduplicator, iter_alert_documents, parse_alert

PARAMS = ConnectionParams(host="10.0.0.9", username="admin", password="p@ss:word")
NS = 'xmlns="http://www.hikvision.com/ver20/XMLSchema"'


def xml(body: str, root: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<{root} version="2.0" {NS}>{body}</{root}>'


def device_info(model: str, device_type: str) -> str:
    return xml(
        f"<deviceName>X</deviceName><model>{model}</model><serialNumber>{model}20251217SN</serialNumber>"
        f"<firmwareVersion>V4.84.100</firmwareVersion><firmwareReleasedDate>build 250918</firmwareReleasedDate>"
        f"<deviceType>{device_type}</deviceType>",
        "DeviceInfo",
    )


NOT_SUPPORTED = xml("<statusCode>4</statusCode><statusString>Invalid Operation</statusString>"
                    "<subStatusCode>notSupport</subStatusCode>", "ResponseStatus")

NVR = {
    "/ISAPI/System/deviceInfo": device_info("DS-7616NXI-K2/16P(D)", "NVR"),
    "/ISAPI/ContentMgmt/InputProxy/channels": xml(
        "<InputProxyChannel><id>1</id><name>Server Rm01</name><sourceInputPortDescriptor>"
        "<proxyProtocol>HIKVISION</proxyProtocol><ipAddress>192.168.254.12</ipAddress><managePortNo>8000</managePortNo>"
        "</sourceInputPortDescriptor></InputProxyChannel>"
        "<InputProxyChannel><id>2</id><name>Gate</name><sourceInputPortDescriptor>"
        "<ipAddress>192.168.254.13</ipAddress></sourceInputPortDescriptor></InputProxyChannel>",
        "InputProxyChannelList",
    ),
    "/ISAPI/ContentMgmt/InputProxy/channels/status": xml(
        "<InputProxyChannelStatus><id>1</id><online>true</online></InputProxyChannelStatus>"
        "<InputProxyChannelStatus><id>2</id><online>false</online></InputProxyChannelStatus>",
        "InputProxyChannelStatusList",
    ),
}

CAMERA = {
    "/ISAPI/System/deviceInfo": device_info("DS-2CD2721G0-IZ", "IPCamera"),
    "/ISAPI/ContentMgmt/InputProxy/channels": (403, NOT_SUPPORTED),
    "/ISAPI/Streaming/channels": xml(
        "<StreamingChannel><id>101</id><channelName>Server Rm01</channelName></StreamingChannel>"
        "<StreamingChannel><id>102</id><channelName>Server Rm01</channelName></StreamingChannel>",
        "StreamingChannelList",
    ),
    "/ISAPI/Streaming/channels/101/picture": (200, b"\xff\xd8jpeg"),
}


def fake_device(replies: dict, seen: list[str] | None = None) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.raw_path.decode()
        if seen is not None:
            seen.append(path)
        reply = replies.get(path)
        if reply is None:
            return httpx.Response(404)
        status, body = reply if isinstance(reply, tuple) else (200, reply)
        return httpx.Response(status, content=body if isinstance(body, bytes) else body.encode())

    return httpx.MockTransport(handler)


def test_registered_for_hikvision():
    assert isinstance(create_driver(Vendor.HIKVISION, PARAMS), HikvisionDriver)


async def test_nvr_info_and_channels():
    async with HikvisionDriver(PARAMS, transport=fake_device(NVR)) as drv:
        info = await drv.get_device_info()
        channels = await drv.list_channels()

    assert (info.vendor, info.kind, info.model) == (Vendor.HIKVISION, DeviceKind.NVR, "DS-7616NXI-K2/16P(D)")
    assert info.firmware == "V4.84.100 build 250918"
    assert info.channel_count == 2
    assert [(c.channel, c.name, c.connected, c.remote_address) for c in channels] == [
        (1, "Server Rm01", True, "192.168.254.12"),
        (2, "Gate", False, "192.168.254.13"),
    ]


async def test_camera_info_channels_snapshot():
    seen: list[str] = []
    async with HikvisionDriver(PARAMS, transport=fake_device(CAMERA, seen)) as drv:
        info = await drv.get_device_info()
        channels = await drv.list_channels()
        jpeg = await drv.get_snapshot(1)

    assert (info.kind, info.channel_count) == (DeviceKind.CAMERA, 1)
    assert [(c.channel, c.name) for c in channels] == [(1, "Server Rm01")]
    assert jpeg.startswith(b"\xff\xd8")
    assert "/ISAPI/Streaming/channels/101/picture" in seen


async def test_stream_urls():
    drv = HikvisionDriver(PARAMS)
    assert await drv.get_stream_url(1, StreamType.MAIN) == "rtsp://10.0.0.9:554/Streaming/Channels/101"
    assert await drv.get_stream_url(12, StreamType.SUB) == "rtsp://10.0.0.9:554/Streaming/Channels/1202"
    await drv.aclose()


async def test_wrong_password_raises_auth_error():
    replies = {"/ISAPI/System/deviceInfo": (401, "<html>Unauthorized</html>")}
    async with HikvisionDriver(PARAMS, transport=fake_device(replies)) as drv:
        with pytest.raises(AuthError):
            await drv.get_device_info()


async def test_switch_is_not_a_video_device():
    replies = {"/ISAPI/System/deviceInfo": device_info("DS-3E1310P-EI/M", "Switch")}
    async with HikvisionDriver(PARAMS, transport=fake_device(replies)) as drv:
        with pytest.raises(NotSupportedError):
            await drv.get_device_info()


def alert(event_type: str, state: str, channel: int, extra: str = "") -> bytes:
    return xml(
        f"<ipAddress>10.0.0.9</ipAddress><channelID>{channel}</channelID>"
        f"<dateTime>2026-11-26T14:34:14+07:00</dateTime><activePostCount>1</activePostCount>"
        f"<eventType>{event_type}</eventType><eventState>{state}</eventState>"
        f"<eventDescription>{event_type} alarm</eventDescription>{extra}",
        "EventNotificationAlert",
    ).encode()


async def test_alert_stream_split_across_chunks_with_pictures():
    boundary = b"\r\n--boundary\r\nContent-Type: application/xml; charset=UTF-8\r\n\r\n"
    picture = b"\r\n--boundary\r\nContent-Type: image/jpeg\r\n\r\n\xff\xd8\x00binary</Event\xff\xd9"
    stream = (boundary + alert("videoloss", "inactive", 1)  # heartbeat, as the real camera sends it (channel 1)
              + boundary + alert("VMD", "active", 1)
              + picture
              + boundary + alert("linedetection", "inactive", 2))

    async def chunks():
        for i in range(0, len(stream), 37):  # deliberately cut documents in odd places
            yield stream[i:i + 37]

    events = [ev async for doc in iter_alert_documents(chunks()) if (ev := parse_alert(doc))]

    assert [(e.type, e.action, e.channel, e.is_ai) for e in events] == [
        (EventType.MOTION, EventAction.START, 1, False),
        (EventType.LINE_CROSSING, EventAction.STOP, 2, True),
    ]
    assert events[0].occurred_at.isoformat() == "2026-11-26T14:34:14+07:00"
    assert events[0].vendor_code == "VMD"


def test_repeated_active_posts_become_one_start_per_burst():
    # The real DS-2CD2721G0-IZ re-posts VMD "active" several times a second and never sends "inactive".
    dedup = ActiveDeduplicator(hold=timedelta(seconds=10))
    motion = parse_alert(alert("VMD", "active", 1))
    other_channel = parse_alert(alert("VMD", "active", 2))
    t0 = datetime(2026, 11, 26, 14, 42, tzinfo=UTC)

    accepted = [dedup.accept(motion, t0 + timedelta(seconds=s)) for s in (0, 0.3, 1, 5, 12, 30)]
    assert accepted == [True, False, False, False, False, True]  # burst 0-12 s (gaps < 10 s), new burst at 30 s
    assert dedup.accept(other_channel, t0) is True
    assert dedup.accept(parse_alert(alert("linedetection", "inactive", 1)), t0) is True


def test_anpr_plate_and_device_level_events():
    anpr = parse_alert(alert("ANPR", "active", 1, "<ANPR><licensePlate>กข1234</licensePlate></ANPR>"))
    assert (anpr.type, anpr.is_ai, anpr.data["license_plate"]) == (EventType.VEHICLE, True, "กข1234")

    disk = parse_alert(alert("diskfull", "active", 1))
    assert (disk.type, disk.channel) == (EventType.DISK_FULL, None)

    assert parse_alert(b"<EventNotificationAlert>broken") is None
