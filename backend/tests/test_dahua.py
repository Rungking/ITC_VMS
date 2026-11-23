import httpx
import pytest

from app.core.enums import DeviceKind
from app.drivers import AuthError, ConnectionParams, EventAction, EventType, StreamType
from app.drivers.dahua import DahuaDriver
from app.drivers.dahua.events import iter_event_blocks, parse_event_block

PARAMS = ConnectionParams(host="10.0.0.5", username="admin", password="p@ss:word")

NVR_REPLIES = {
    "/cgi-bin/magicBox.cgi?action=getSystemInfo": "deviceType=DHI-NVR4216-16P-I\r\nserialNumber=ABC123\r\n",
    "/cgi-bin/magicBox.cgi?action=getSoftwareVersion": "version=4.001.0000000.3,build:2024-01-01\r\n",
    "/cgi-bin/configManager.cgi?action=getConfig&name=ChannelTitle": (
        "table.ChannelTitle[1].Name=ตลาดสด\r\n"
        "table.ChannelTitle[0].Name=หน้าสำนักงาน\r\n"
        "table.ChannelTitle[2].Name=\r\n"
    ),
}


def fake_device(replies: dict[str, str], status: int = 200) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        key = request.url.raw_path.decode()
        if key not in replies:
            return httpx.Response(404)
        return httpx.Response(status, text=replies[key])

    return httpx.MockTransport(handler)


async def test_device_info_and_channels():
    async with DahuaDriver(PARAMS, transport=fake_device(NVR_REPLIES)) as drv:
        info = await drv.get_device_info()
        channels = await drv.list_channels()

    assert info.kind is DeviceKind.NVR
    assert (info.model, info.serial, info.channel_count) == ("DHI-NVR4216-16P-I", "ABC123", 3)
    assert [(c.channel, c.name) for c in channels] == [(1, "หน้าสำนักงาน"), (2, "ตลาดสด"), (3, "Channel 3")]


async def test_wrong_password_raises_auth_error():
    async with DahuaDriver(PARAMS, transport=fake_device(NVR_REPLIES, status=401)) as drv:
        with pytest.raises(AuthError):
            await drv.list_channels()


async def test_stream_urls_and_credentials():
    drv = DahuaDriver(PARAMS)
    main = await drv.get_stream_url(2, StreamType.MAIN)
    sub = await drv.get_stream_url(2, StreamType.SUB)
    assert main == "rtsp://10.0.0.5:554/cam/realmonitor?channel=2&subtype=0"
    assert sub.endswith("subtype=1")
    assert drv.authenticated_url(main).startswith("rtsp://admin:p%40ss%3Aword@10.0.0.5:554/cam/")
    await drv.aclose()


def test_parse_motion_event():
    ev = parse_event_block("Code=VideoMotion;action=Start;index=3")
    assert ev.type is EventType.MOTION
    assert ev.action is EventAction.START
    assert ev.channel == 4
    assert not ev.is_ai


def test_parse_ai_event_with_multiline_json():
    block = (
        "Code=CrossLineDetection;action=Start;index=0;data={\n"
        ' "Name" : "Gate; line 1",\n'
        ' "Object" : {"ObjectType" : "Human"}\n'
        "}"
    )
    ev = parse_event_block(block)
    assert ev.type is EventType.LINE_CROSSING
    assert ev.is_ai
    assert ev.data["Object"]["ObjectType"] == "Human"
    assert ev.data["Name"] == "Gate; line 1"


def test_device_level_event_has_no_channel():
    ev = parse_event_block("Code=StorageFailure;action=Pulse;index=0")
    assert ev.type is EventType.DISK_ERROR
    assert ev.channel is None


def test_unknown_code_and_garbage():
    assert parse_event_block("Code=SomethingNew;action=Start;index=1").type is EventType.OTHER
    assert parse_event_block("Heartbeat") is None
    assert parse_event_block("") is None


async def test_iter_event_blocks_splits_multipart_stream():
    raw = [
        "--myboundary", "Content-Type: text/plain", "Content-Length: 36", "",
        "Code=VideoMotion;action=Start;index=0",
        "--myboundary", "Content-Type: text/plain", "Content-Length: 9", "",
        "Heartbeat",
        "--myboundary", "Content-Type: text/plain", "",
        "Code=CrossRegionDetection;action=Start;index=1;data={", '  "Name": "Zone A"', "}",
        "Code=VideoMotion;action=Stop;index=0",  # no boundary in between (seen on some firmware)
    ]

    async def lines():
        for line in raw:
            yield line

    events = [parse_event_block(b) async for b in iter_event_blocks(lines())]
    assert [(e.type, e.action, e.channel) for e in events] == [
        (EventType.MOTION, EventAction.START, 1),
        (EventType.INTRUSION, EventAction.START, 2),
        (EventType.MOTION, EventAction.STOP, 1),
    ]
    assert events[1].data == {"Name": "Zone A"}
