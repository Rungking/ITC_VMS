"""Thin async client for Hikvision ISAPI (cameras, NVRs), XML over HTTP with Digest auth.

Reference: Hikvision "ISAPI Developer Guide"; behaviour checked on DS-7616NXI-K2/16P(D) V4.84 and
DS-2CD2721G0-IZ V5.7 (see docs/LAB_DEVICES.md).
"""

import xml.etree.ElementTree as ET
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx

from app.drivers.base import AuthError, ConnectionParams, DeviceUnreachableError, DriverError, NotSupportedError

_MAX_XML_BYTES = 2_000_000  # device replies are a few KB; refuse anything absurd


def parse_xml(content: bytes) -> ET.Element:
    """Parse ISAPI XML and drop namespaces, so callers can write `root.findtext("model")`."""
    if len(content) > _MAX_XML_BYTES:
        raise DriverError("ISAPI reply too large")
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise DriverError(f"ISAPI reply is not valid XML: {e}") from e
    for el in root.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return root


def _status_detail(response: httpx.Response) -> str:
    """ISAPI errors come as <ResponseStatus><statusString/><subStatusCode/></ResponseStatus>."""
    try:
        root = parse_xml(response.content)
    except DriverError:
        return f"HTTP {response.status_code}"
    parts = [root.findtext("statusString"), root.findtext("subStatusCode")]
    return " / ".join(p for p in parts if p) or f"HTTP {response.status_code}"


class HikvisionClient:
    def __init__(self, params: ConnectionParams, transport: httpx.AsyncBaseTransport | None = None) -> None:
        scheme = "https" if params.use_https else "http"
        self._http = httpx.AsyncClient(
            base_url=f"{scheme}://{params.host}:{params.http_port}",
            auth=httpx.DigestAuth(params.username, params.password),
            timeout=params.timeout,
            verify=False,  # devices ship self-signed certificates
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    @staticmethod
    def _check(response: httpx.Response, path: str) -> None:
        if response.status_code == 401:
            # Also returned while the device locks this IP after repeated wrong passwords (~30 min).
            raise AuthError("ชื่อผู้ใช้หรือรหัสผ่านของอุปกรณ์ไม่ถูกต้อง (หรืออุปกรณ์ล็อกชั่วคราวเพราะใส่ผิดหลายครั้ง)")
        if response.status_code in (403, 404):
            # 403 = this device type has no such resource (e.g. NVR channel list on a camera), 404 = unknown URL
            raise NotSupportedError(f"{path} -> {_status_detail(response)}")
        if response.status_code >= 400:
            raise DriverError(f"{path} -> {_status_detail(response)}")

    async def _get(self, path: str) -> httpx.Response:
        try:
            response = await self._http.get(path)
        except httpx.TransportError as e:
            raise DeviceUnreachableError(f"เชื่อมต่ออุปกรณ์ไม่ได้: {e.__class__.__name__}") from e
        self._check(response, path)
        return response

    async def get_xml(self, path: str) -> ET.Element:
        return parse_xml((await self._get(path)).content)

    async def get_bytes(self, path: str) -> bytes:
        return (await self._get(path)).content

    @asynccontextmanager
    async def stream_bytes(self, path: str) -> AsyncIterator[AsyncIterator[bytes]]:
        """Open a never-ending response (alertStream) and yield its raw chunks."""
        timeout = httpx.Timeout(self._http.timeout.connect, read=60.0)  # heartbeat arrives every ~10 s
        try:
            async with self._http.stream("GET", path, timeout=timeout) as response:
                if response.status_code >= 400:
                    await response.aread()
                self._check(response, path)
                yield response.aiter_bytes()
        except httpx.TransportError as e:
            raise DeviceUnreachableError(f"การเชื่อมต่อ event stream หลุด: {e.__class__.__name__}") from e
