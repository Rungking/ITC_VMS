"""Grab one JPEG frame from a live PushSource - the snapshot fallback for devices whose snapshot API fails."""

import tempfile
from pathlib import Path

from app.drivers.base import DriverError, PushSource
from app.media.bridge import StreamBridge


def grab_frame(source: PushSource, timeout: float = 10.0) -> bytes:
    """Blocking. Decodes until the first complete picture (needs a keyframe, usually < 2 s)."""
    with tempfile.TemporaryDirectory(prefix="vms-frame-") as tmp:
        out = Path(tmp) / "frame.jpg"
        bridge = StreamBridge(source, output_args=["-frames:v", "1", "-q:v", "3", "-y", str(out)])
        bridge.start()
        try:
            bridge.wait(timeout)
        finally:
            bridge.stop()
        if not out.exists() or out.stat().st_size == 0:
            raise DriverError("ดึงภาพนิ่งจากวิดีโอไม่สำเร็จ")
        return out.read_bytes()
