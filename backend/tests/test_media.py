import asyncio
import shutil
import subprocess
import threading
import time

import pytest

from app.drivers import PushSource
from app.media.bridge import StreamBridge
from app.media.rtsp_probe import probe_rtsp

SDP = "v=0\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\n"


async def fake_rtsp_server(behaviour: str):
    """behaviour: 'ok' (Basic auth then SDP) or 'hang' (accept auth, never answer - like the 2016 NVR)."""

    async def handle(reader, writer):
        try:
            while True:
                head = (await reader.readuntil(b"\r\n\r\n")).decode()
                cseq = head.split("CSeq: ")[1].split("\r\n")[0]
                if "Authorization: Basic" not in head:
                    writer.write(f'RTSP/1.0 401 Unauthorized\r\nCSeq: {cseq}\r\n'
                                 f'WWW-Authenticate: Basic realm="x"\r\n\r\n'.encode())
                elif behaviour == "ok":
                    writer.write(f"RTSP/1.0 200 OK\r\nCSeq: {cseq}\r\nContent-Length: {len(SDP)}\r\n\r\n{SDP}".encode())
                else:
                    await reader.read()  # say nothing until the client gives up and disconnects
                    return
                await writer.drain()
        except (asyncio.IncompleteReadError, ConnectionError):
            pass

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1]


async def test_probe_rtsp_ok_with_basic_auth():
    server, port = await fake_rtsp_server("ok")
    async with server:
        result = await probe_rtsp(f"rtsp://u:p%40ss@127.0.0.1:{port}/cam/realmonitor?channel=1&subtype=1", timeout=3)
    assert result.ok and result.status == "200 OK" and result.codecs == ["H264/90000"]


async def test_probe_rtsp_detects_server_that_hangs_after_login():
    server, port = await fake_rtsp_server("hang")
    async with server:
        result = await probe_rtsp(f"rtsp://u:p@127.0.0.1:{port}/x", timeout=1)
    assert not result.ok and result.status == "timeout"


async def test_probe_rtsp_nothing_listening():
    result = await probe_rtsp("rtsp://u:p@127.0.0.1:1/x", timeout=3)
    # Linux refuses at once; Windows retries the SYN for ~2s, which may hit the timeout instead.
    assert not result.ok and (result.status.startswith("connection error") or result.status == "timeout")


class FakeSdkSource(PushSource):
    """Pushes an MPEG-TS file in chunks from its own thread, like a vendor SDK callback would."""

    container = "mpegts"

    def __init__(self, data: bytes) -> None:
        self._data, self._stop = data, threading.Event()

    def start(self, on_data) -> None:
        def run():
            for i in range(0, len(self._data), 4096):
                if self._stop.is_set():
                    return
                on_data(self._data[i:i + 4096])

        threading.Thread(target=run, daemon=True).start()

    def stop(self) -> None:
        self._stop.set()


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_stream_bridge_remuxes_without_transcoding(tmp_path):
    sample = tmp_path / "in.ts"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc=size=320x240:rate=25:duration=2", "-c:v", "libx264", "-g", "25",
                    "-f", "mpegts", str(sample)], check=True)
    out = tmp_path / "out.mp4"

    bridge = StreamBridge(FakeSdkSource(sample.read_bytes()), output_args=["-c", "copy", "-y", str(out)])
    bridge.start()
    time.sleep(1.5)
    bridge.stop()

    assert bridge.bytes_in == sample.stat().st_size and bridge.dropped_chunks == 0
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_name,width",
                            "-of", "csv=p=0", str(out)], capture_output=True, text=True, check=True)
    assert probe.stdout.strip() == "h264,320"


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")
def test_grab_frame_returns_jpeg(tmp_path):
    from app.media.frame import grab_frame

    sample = tmp_path / "in.ts"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i",
                    "testsrc=size=320x240:rate=25:duration=2", "-c:v", "libx264", "-g", "25",
                    "-f", "mpegts", str(sample)], check=True)
    jpeg = grab_frame(FakeSdkSource(sample.read_bytes()), timeout=10)
    assert jpeg[:2] == b"\xff\xd8"
