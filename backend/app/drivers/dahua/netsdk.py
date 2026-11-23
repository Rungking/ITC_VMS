"""Dahua NetSDK access (private protocol, TCP 37777).

Used for devices whose RTSP / snapshot.cgi don't work - typically old firmware (seen on a 2016 NVR).
The SDK wheel is licensed from Dahua and is NOT on PyPI: install it from Z_ExternalFile/ (see README).

The SDK is one process-wide C library with *global* callbacks, so `NetSdkRuntime` owns it and routes
callbacks to the right login / live stream. Every SDK call blocks: call them from a worker thread
(`asyncio.to_thread`). Callbacks run on SDK threads - handlers must be quick and must not block.
"""

from __future__ import annotations

import ctypes
import logging
import threading
from collections.abc import Callable
from dataclasses import dataclass

from app.drivers.base import (
    AuthError,
    DeviceUnreachableError,
    DriverError,
    NotSupportedError,
    PushSource,
    StreamType,
)

log = logging.getLogger(__name__)

try:
    from NetSDK.NetSDK import NetClient
    from NetSDK.SDK_Callback import CB_FUNCTYPE, fDisConnect, fHaveReConnect, fRealDataCallBackEx2
    from NetSDK.SDK_Enum import EM_LOGIN_SPAC_CAP_TYPE, EM_REALDATA_FLAG, SDK_RealPlayType
    from NetSDK.SDK_Struct import (
        C_DWORD,
        C_LDWORD,
        C_LLONG,
        NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY,
        NET_IN_SNAP_PIC_TO_FILE_PARAM,
        NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY,
        NET_OUT_SNAP_PIC_TO_FILE_PARAM,
    )

    AVAILABLE = True
except ImportError:  # SDK not installed on this machine
    AVAILABLE = False

AlarmHandler = Callable[[int, bytes], None]  # (command, payload)
DataHandler = Callable[[bytes], None]
ConnectionHandler = Callable[[bool], None]  # True = (re)connected, False = lost

# NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY.nError
_LOGIN_ERRORS = {
    1: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง",
    2: "ไม่มีชื่อผู้ใช้นี้ในอุปกรณ์",
    3: "หมดเวลาเชื่อมต่อ",
    4: "บัญชีนี้ login ซ้ำอยู่แล้ว",
    5: "บัญชีถูกล็อก (ใส่รหัสผิดหลายครั้ง)",
    6: "บัญชีถูกห้ามใช้งาน",
    7: "อุปกรณ์ไม่ว่าง ทรัพยากรไม่พอ",
    8: "เชื่อมต่อช่องย่อยไม่สำเร็จ",
    9: "เชื่อมต่อไม่สำเร็จ",
    10: "จำนวนการเชื่อมต่อเต็ม",
    13: "IP นี้ไม่ได้รับอนุญาตให้ login",
    18: "อุปกรณ์ยังไม่ได้ตั้งค่าบัญชีเริ่มต้น",
}
_AUTH_ERRORS = {1, 2, 5, 6, 13, 18}

_MAX_SNAPSHOT_BYTES = 4 * 1024 * 1024


def _safe(fn: Callable, *args) -> None:
    """Exceptions must never escape into the C library."""
    try:
        fn(*args)
    except Exception:
        log.exception("NetSDK callback handler failed")


class NetSdkRuntime:
    """Process-wide singleton around the SDK. Use `NetSdkRuntime.get()`."""

    _instance: NetSdkRuntime | None = None
    _lock = threading.Lock()

    @classmethod
    def get(cls) -> NetSdkRuntime:
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def __init__(self) -> None:
        if not AVAILABLE:
            raise NotSupportedError("Dahua NetSDK is not installed (pip install the NetSDK wheel from Dahua)")
        self.sdk = NetClient()
        if not hasattr(NetClient, "sdk"):  # NetClient swallows OSError when a native library fails to load
            raise NotSupportedError(
                "Dahua NetSDK native libraries failed to load "
                "(on Linux: apt-get install libx11-6 libxv1 libgl1 libasound2)"
            )

        self._alarm_handlers: dict[int, AlarmHandler] = {}
        self._data_handlers: dict[int, DataHandler] = {}
        self._conn_handlers: dict[int, ConnectionHandler] = {}

        # Keep references: ctypes callbacks are freed (and crash the process) if garbage-collected.
        self._cb_disconnect = fDisConnect(self._on_disconnect)
        self._cb_reconnect = fHaveReConnect(self._on_reconnect)
        self._cb_data = fRealDataCallBackEx2(self._on_data)
        self._cb_alarm = CB_FUNCTYPE(
            None, ctypes.c_long, C_LLONG, ctypes.POINTER(ctypes.c_char), C_DWORD,
            ctypes.POINTER(ctypes.c_char), ctypes.c_long, ctypes.c_int, ctypes.c_long, C_LDWORD,
        )(self._on_alarm)

        self.sdk.InitEx(self._cb_disconnect)
        self.sdk.SetAutoReconnect(self._cb_reconnect)
        self.sdk.SetDVRMessCallBackEx1(self._cb_alarm, 0)

    # --- callbacks (SDK threads) -------------------------------------------
    def _on_disconnect(self, login_id, ip, port, user_data):
        if handler := self._conn_handlers.get(int(login_id)):
            _safe(handler, False)

    def _on_reconnect(self, login_id, ip, port, user_data):
        if handler := self._conn_handlers.get(int(login_id)):
            _safe(handler, True)

    def _on_data(self, handle, data_type, buf, size, param, user_data):
        if data_type == 0 and size > 0 and (handler := self._data_handlers.get(int(handle))):
            _safe(handler, ctypes.string_at(buf, size))

    def _on_alarm(self, command, login_id, buf, length, ip, port, ack, event_id, user_data):
        if handler := self._alarm_handlers.get(int(login_id)):
            _safe(handler, int(command), ctypes.string_at(buf, length) if length > 0 else b"")


@dataclass(frozen=True, slots=True)
class SdkLoginInfo:
    serial: str
    channel_count: int


class NetSdkSession:
    """One login to one device. All methods block - call them via asyncio.to_thread."""

    def __init__(self, host: str, port: int, username: str, password: str) -> None:
        self.host, self.port = host, port
        self._username, self._password = username, password
        self._rt = NetSdkRuntime.get()
        self.login_id = 0
        self._live: set[int] = set()

    def login(self, on_connection: ConnectionHandler | None = None) -> SdkLoginInfo:
        inp = NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY()
        inp.dwSize = ctypes.sizeof(NET_IN_LOGIN_WITH_HIGHLEVEL_SECURITY)
        inp.szIP = self.host.encode()
        inp.nPort = self.port
        inp.szUserName = self._username.encode()
        inp.szPassword = self._password.encode()
        inp.emSpecCap = EM_LOGIN_SPAC_CAP_TYPE.TCP
        inp.pCapParam = None
        out = NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY()
        out.dwSize = ctypes.sizeof(NET_OUT_LOGIN_WITH_HIGHLEVEL_SECURITY)

        login_id, info, _ = self._rt.sdk.LoginWithHighLevelSecurity(inp, out)
        if not login_id:
            message = _LOGIN_ERRORS.get(out.nError, f"NetSDK login error {out.nError}")
            if out.nError in _AUTH_ERRORS:
                raise AuthError(message)
            raise DeviceUnreachableError(message)
        self.login_id = int(login_id)
        if on_connection:
            self._rt._conn_handlers[self.login_id] = on_connection
        serial = bytes(info.sSerialNumber).split(b"\0")[0].decode(errors="ignore")
        return SdkLoginInfo(serial=serial, channel_count=int(info.nChanNum))

    def logout(self) -> None:
        if not self.login_id:
            return
        for handle in list(self._live):
            self.stop_live(handle)
        self.stop_alarms()
        self._rt._conn_handlers.pop(self.login_id, None)
        self._rt.sdk.Logout(self.login_id)
        self.login_id = 0

    def _require_login(self) -> None:
        if not self.login_id:
            raise DriverError("NetSDK session is not logged in")

    # --- live video ---------------------------------------------------------
    def start_live(self, channel: int, stream: StreamType, on_data: DataHandler) -> int:
        """Start pulling raw DAV-container video for a 1-based channel. Returns a handle for stop_live."""
        self._require_login()
        play_type = SDK_RealPlayType.Realplay if stream is StreamType.MAIN else SDK_RealPlayType.Realplay_1
        handle = int(self._rt.sdk.RealPlayEx(self.login_id, channel - 1, 0, play_type))
        if not handle:
            raise DriverError(f"NetSDK live view failed: {self._rt.sdk.GetLastErrorMessage()}")
        self._rt._data_handlers[handle] = on_data
        self._rt.sdk.SetRealDataCallBackEx2(handle, self._rt._cb_data, None, EM_REALDATA_FLAG.RAW_DATA)
        self._live.add(handle)
        return handle

    def stop_live(self, handle: int) -> None:
        self._rt.sdk.StopRealPlayEx(handle)
        self._rt._data_handlers.pop(handle, None)
        self._live.discard(handle)

    # --- snapshot -------------------------------------------------------------
    def snapshot(self, channel: int, timeout_ms: int = 5000) -> bytes:
        self._require_login()
        inp = NET_IN_SNAP_PIC_TO_FILE_PARAM()
        inp.dwSize = ctypes.sizeof(NET_IN_SNAP_PIC_TO_FILE_PARAM)
        inp.stuParam.Channel = channel - 1
        inp.stuParam.Quality = 6
        inp.stuParam.mode = 0  # one frame
        buf = ctypes.create_string_buffer(_MAX_SNAPSHOT_BYTES)
        out = NET_OUT_SNAP_PIC_TO_FILE_PARAM()
        out.dwSize = ctypes.sizeof(NET_OUT_SNAP_PIC_TO_FILE_PARAM)
        out.szPicBuf = ctypes.cast(buf, ctypes.c_char_p)
        out.dwPicBufLen = _MAX_SNAPSHOT_BYTES
        if not self._rt.sdk.SnapPictureToFile(self.login_id, inp, out, timeout_ms) or not out.dwPicBufRetLen:
            raise DriverError(f"NetSDK snapshot failed: {self._rt.sdk.GetLastErrorMessage()}")
        return buf.raw[: out.dwPicBufRetLen]

    # --- alarms -------------------------------------------------------------
    def start_alarms(self, on_alarm: AlarmHandler) -> None:
        self._require_login()
        self._rt._alarm_handlers[self.login_id] = on_alarm
        if not self._rt.sdk.StartListenEx(self.login_id):
            self._rt._alarm_handlers.pop(self.login_id, None)
            raise DriverError(f"NetSDK alarm subscription failed: error {self._rt.sdk.GetLastError()}")

    def stop_alarms(self) -> None:
        if self._rt._alarm_handlers.pop(self.login_id, None) is not None:
            self._rt.sdk.StopListen(self.login_id)


class NetSdkLiveSource(PushSource):
    """Live video of one channel through NetSDK, delivered as Dahua DAV container bytes."""

    container = "dhav"

    def __init__(self, session: NetSdkSession, channel: int, stream: StreamType) -> None:
        self._session, self._channel, self._stream = session, channel, stream
        self._handle = 0

    def start(self, on_data: DataHandler) -> None:
        self._handle = self._session.start_live(self._channel, self._stream, on_data)

    def stop(self) -> None:
        if self._handle:
            self._session.stop_live(self._handle)
            self._handle = 0
