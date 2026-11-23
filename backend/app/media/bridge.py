"""Bridge a PushSource (video bytes from a vendor SDK) into ffmpeg.

ffmpeg re-muxes without transcoding (-c copy, low CPU) and by default publishes RTSP to MediaMTX,
after which the stream looks exactly like any other camera to the rest of the system.

    bridge = StreamBridge(source, publish_url="rtsp://mediamtx:8554/cam-12")
    bridge.start()   # blocking calls - run from a worker thread
    ...
    bridge.stop()
"""

import logging
import queue
import shutil
import subprocess
import threading

from app.drivers.base import PushSource

log = logging.getLogger(__name__)

_QUEUE_CHUNKS = 512  # ~ several seconds of video; beyond that we drop rather than block the SDK thread


class StreamBridge:
    def __init__(
        self,
        source: PushSource,
        publish_url: str | None = None,
        output_args: list[str] | None = None,
        ffmpeg: str = "ffmpeg",
    ) -> None:
        if (publish_url is None) == (output_args is None):
            raise ValueError("give exactly one of publish_url or output_args")
        self._source = source
        self._output = output_args or ["-c", "copy", "-f", "rtsp", "-rtsp_transport", "tcp", publish_url]
        self._ffmpeg = shutil.which(ffmpeg) or ffmpeg
        self._queue: queue.Queue[bytes | None] = queue.Queue(maxsize=_QUEUE_CHUNKS)
        self._proc: subprocess.Popen | None = None
        self._writer: threading.Thread | None = None
        self.bytes_in = 0
        self.dropped_chunks = 0

    @property
    def running(self) -> bool:
        return self._proc is not None and self._proc.poll() is None

    def start(self) -> None:
        cmd = [
            self._ffmpeg, "-hide_banner", "-loglevel", "error",
            "-fflags", "+genpts", "-f", self._source.container, "-i", "pipe:0",
            "-map", "0:v", *self._output,
        ]
        self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        self._writer = threading.Thread(target=self._write_loop, name="stream-bridge", daemon=True)
        self._writer.start()
        try:
            self._source.start(self._on_data)
        except Exception:
            self.stop()
            raise

    def _on_data(self, chunk: bytes) -> None:  # vendor thread: must never block
        self.bytes_in += len(chunk)
        try:
            self._queue.put_nowait(chunk)
        except queue.Full:
            self.dropped_chunks += 1
            if self.dropped_chunks % 100 == 1:
                log.warning("stream bridge: ffmpeg is not keeping up, dropped %d chunks", self.dropped_chunks)

    def _write_loop(self) -> None:
        assert self._proc and self._proc.stdin
        while (chunk := self._queue.get()) is not None:
            try:
                self._proc.stdin.write(chunk)
            except (BrokenPipeError, OSError):
                log.error("stream bridge: ffmpeg exited (code %s)", self._proc.poll())
                return
        try:
            self._proc.stdin.close()
        except OSError:
            pass

    def wait(self, timeout: float) -> bool:
        """Wait for ffmpeg to exit by itself (e.g. after `-frames:v 1`). True if it did."""
        if not self._proc:
            return False
        try:
            self._proc.wait(timeout)
            return True
        except subprocess.TimeoutExpired:
            return False

    def stop(self, timeout: float = 5.0) -> None:
        try:
            self._source.stop()
        finally:
            # Tell the writer to close ffmpeg's stdin so ffmpeg finishes the output.
            if self._writer and self._writer.is_alive():
                self._queue.put(None)  # writer still consuming: queued video is written first
            else:  # ffmpeg already exited (e.g. one-frame grab): nobody consumes, so just clear the queue
                while True:
                    try:
                        self._queue.get_nowait()
                    except queue.Empty:
                        break
            if self._writer:
                self._writer.join(timeout)
            if self._proc:
                try:
                    self._proc.wait(timeout)
                except subprocess.TimeoutExpired:
                    self._proc.kill()
                    self._proc.wait()
