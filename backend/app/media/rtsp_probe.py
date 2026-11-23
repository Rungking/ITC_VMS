"""Quick RTSP health check: does DESCRIBE return an SDP within a few seconds?

Some firmware accepts the login and then never answers (seen on a 2016 Dahua NVR), so a plain
TCP connect test is not enough - we need the full DESCRIBE round trip.
"""

import asyncio
import base64
import hashlib
import re
from dataclasses import dataclass, field
from urllib.parse import unquote, urlsplit, urlunsplit


@dataclass(frozen=True, slots=True)
class RtspProbeResult:
    ok: bool
    status: str  # e.g. "200 OK", "401 Unauthorized", "timeout", "connection refused"
    codecs: list[str] = field(default_factory=list)  # e.g. ["H264/90000"]


async def _read_response(reader: asyncio.StreamReader) -> str:
    head = (await reader.readuntil(b"\r\n\r\n")).decode(errors="ignore")
    if m := re.search(r"Content-Length:\s*(\d+)", head, re.I):
        head += (await reader.readexactly(int(m[1]))).decode(errors="ignore")
    return head


def _authorization(challenges: list[str], user: str, password: str, uri: str) -> str:
    digest = next((c for c in challenges if c.lower().startswith("digest")), None)
    if digest:
        realm = re.search(r'realm="([^"]*)"', digest)[1]
        nonce = re.search(r'nonce="([^"]*)"', digest)[1]
        ha1 = hashlib.md5(f"{user}:{realm}:{password}".encode()).hexdigest()
        ha2 = hashlib.md5(f"DESCRIBE:{uri}".encode()).hexdigest()
        response = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
        return f'Digest username="{user}", realm="{realm}", nonce="{nonce}", uri="{uri}", response="{response}"'
    return "Basic " + base64.b64encode(f"{user}:{password}".encode()).decode()


async def probe_rtsp(url: str, timeout: float = 6.0) -> RtspProbeResult:  # noqa: ASYNC109 - one-shot check
    """`url` may contain credentials (rtsp://user:pass@host/...). They are never put in the result."""
    parts = urlsplit(url)
    user, password = unquote(parts.username or ""), unquote(parts.password or "")
    port = parts.port or 554
    clean = urlunsplit(parts._replace(netloc=f"{parts.hostname}:{port}"))

    try:
        async with asyncio.timeout(timeout):
            reader, writer = await asyncio.open_connection(parts.hostname, port)
            try:
                cseq, auth = 1, None
                while True:
                    req = (f"DESCRIBE {clean} RTSP/1.0\r\nCSeq: {cseq}\r\n"
                           "Accept: application/sdp\r\nUser-Agent: cctv\r\n")
                    if auth:
                        req += f"Authorization: {auth}\r\n"
                    writer.write((req + "\r\n").encode())
                    await writer.drain()
                    resp = await _read_response(reader)
                    status = resp.split("\r\n", 1)[0].partition(" ")[2]
                    if status.startswith("401") and auth is None and user:
                        challenges = re.findall(r"WWW-Authenticate:\s*([^\r\n]+)", resp, re.I)
                        auth = _authorization(challenges, user, password, clean)
                        cseq += 1
                        continue
                    codecs = re.findall(r"a=rtpmap:\d+ ([^\r\n]+)", resp)
                    return RtspProbeResult(ok=status.startswith("200") and bool(codecs), status=status, codecs=codecs)
            finally:
                writer.close()
    except TimeoutError:
        return RtspProbeResult(ok=False, status="timeout")
    except (OSError, asyncio.IncompleteReadError) as e:
        return RtspProbeResult(ok=False, status=f"connection error: {e.__class__.__name__}")
