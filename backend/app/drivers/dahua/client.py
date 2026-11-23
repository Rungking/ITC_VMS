"""Thin async client for the Dahua HTTP API (CGI), used by cameras and NVRs alike.

Reference: official "Dahua HTTP API" spec, and github.com/rroller/dahua for firmware quirks.
"""

import logging
from collections.abc import AsyncIterator, Generator
from contextlib import asynccontextmanager

import httpx

from app.drivers.base import AuthError, ConnectionParams, DeviceUnreachableError, DriverError

log = logging.getLogger(__name__)


class DeviceAuth(httpx.Auth):
    """Answer whichever challenge the device sends: Digest (preferred) or Basic.

    Dahua firmware differs: most use Digest, some NVRs ship with `Basic realm="Device_CGI"`.
    The scheme is remembered after the first challenge so later requests skip the extra round trip.
    """

    def __init__(self, username: str, password: str, host: str) -> None:
        self._digest = httpx.DigestAuth(username, password)
        self._basic = httpx.BasicAuth(username, password)
        self._host = host
        self._scheme: str | None = None

    def auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response, None]:
        if self._scheme == "basic":
            yield from self._basic.auth_flow(request)
            return
        if self._scheme == "digest":
            yield from self._digest.auth_flow(request)
            return

        response = yield request
        if response.status_code != 401:
            return
        challenges = " ".join(response.headers.get_list("www-authenticate")).lower()
        if "digest" in challenges:
            self._scheme = "digest"
            # Hand the 401 we already have to the digest flow instead of letting it re-send the request.
            flow = self._digest.auth_flow(request)
            next(flow)  # the digest flow's own unauthenticated attempt - skipped
            try:
                authed = flow.send(response)
                while True:
                    authed = flow.send((yield authed))
            except StopIteration:
                pass
        elif "basic" in challenges:
            self._scheme = "basic"
            if request.url.scheme == "http":
                log.warning("%s only offers Basic auth over HTTP: the password is sent unencrypted. "
                            "Enable Digest or HTTPS on the device.", self._host)
            yield from self._basic.auth_flow(request)


def parse_kv(text: str) -> dict[str, str]:
    """Dahua CGI replies are `key=value` lines, e.g. `table.ChannelTitle[0].Name=Gate`."""
    result: dict[str, str] = {}
    for line in text.splitlines():
        key, sep, value = line.partition("=")
        if sep:
            result[key.strip()] = value.strip()
    return result


class DahuaClient:
    def __init__(self, params: ConnectionParams, transport: httpx.AsyncBaseTransport | None = None) -> None:
        scheme = "https" if params.use_https else "http"
        self._http = httpx.AsyncClient(
            base_url=f"{scheme}://{params.host}:{params.http_port}",
            auth=DeviceAuth(params.username, params.password, params.host),
            timeout=params.timeout,
            verify=False,  # devices ship self-signed certificates
            transport=transport,
        )

    async def aclose(self) -> None:
        await self._http.aclose()

    @staticmethod
    def _check(response: httpx.Response, path: str) -> None:
        if response.status_code == 401:
            raise AuthError("ชื่อผู้ใช้หรือรหัสผ่านของอุปกรณ์ไม่ถูกต้อง")
        if response.status_code >= 400:
            raise DriverError(f"{path} -> HTTP {response.status_code}")

    async def _get(self, path: str) -> httpx.Response:
        try:
            response = await self._http.get(path)
        except httpx.TransportError as e:
            raise DeviceUnreachableError(f"เชื่อมต่ออุปกรณ์ไม่ได้: {e.__class__.__name__}") from e
        self._check(response, path)
        return response

    # Paths are passed pre-built (query included) because some Dahua firmware rejects
    # percent-encoded brackets such as codes=%5BAll%5D.
    async def get_text(self, path: str) -> str:
        return (await self._get(path)).text

    async def get_bytes(self, path: str) -> bytes:
        return (await self._get(path)).content

    async def get_kv(self, path: str) -> dict[str, str]:
        return parse_kv(await self.get_text(path))

    @asynccontextmanager
    async def stream_lines(self, path: str) -> AsyncIterator[AsyncIterator[str]]:
        """Open a never-ending response (event stream) and yield its lines."""
        timeout = httpx.Timeout(self._http.timeout.connect, read=60.0)  # heartbeat arrives every few seconds
        try:
            async with self._http.stream("GET", path, timeout=timeout) as response:
                self._check(response, path)
                yield response.aiter_lines()
        except httpx.TransportError as e:
            raise DeviceUnreachableError(f"การเชื่อมต่อ event stream หลุด: {e.__class__.__name__}") from e
