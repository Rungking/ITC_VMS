"""Admin command line.

    python -m app.cli gen-keys
    python -m app.cli create-admin --username admin
    python -m app.cli probe --host 192.168.1.108 --user admin [--snapshot ch1.jpg] [--events 30]

`probe` talks to a real device without touching the database - use it in the lab to check
that a camera/NVR works with our driver. The device password is read from VMS_PROBE_PASSWORD
or asked interactively (never pass it on the command line: it ends up in shell history).
"""

import argparse
import asyncio
import getpass
import os
import secrets
import sys
from pathlib import Path

from app.core.enums import Vendor


def _gen_keys(_: argparse.Namespace) -> None:
    from cryptography.fernet import Fernet

    print(f"VMS_SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"VMS_CREDENTIALS_KEY={Fernet.generate_key().decode()}")


async def _create_admin(args: argparse.Namespace) -> None:
    from sqlalchemy import select

    from app.core.db import SessionLocal
    from app.core.enums import Role
    from app.core.security import hash_password
    from app.models import User

    password = getpass.getpass("New admin password (min 8 chars): ")
    if len(password) < 8:
        sys.exit("Password too short")
    async with SessionLocal() as db:
        if await db.scalar(select(User.id).where(User.username == args.username)):
            sys.exit(f"User {args.username!r} already exists")
        db.add(User(username=args.username, full_name=args.full_name,
                    password_hash=hash_password(password), role=Role.ADMIN))
        await db.commit()
    print(f"Created admin {args.username!r}")


async def _probe(args: argparse.Namespace) -> None:
    from app.drivers import ConnectionParams, DriverError, StreamType, create_driver

    password = os.environ.get("VMS_PROBE_PASSWORD") or getpass.getpass(f"Password for {args.user}@{args.host}: ")
    params = ConnectionParams(host=args.host, username=args.user, password=password,
                              http_port=args.http_port, rtsp_port=args.rtsp_port, use_https=args.https)
    try:
        async with create_driver(Vendor(args.vendor), params) as drv:
            info = await drv.get_device_info()
            print(f"\n== Device ==\n{info.kind.value.upper()}  {info.model}  S/N {info.serial}  FW {info.firmware}")

            channels = await drv.list_channels()
            in_use = [c for c in channels if c.connected is not False]
            print(f"\n== Channels: {len(in_use)} with a camera / {len(channels)} total ==")
            for ch in in_use:
                main = await drv.get_stream_url(ch.channel, StreamType.MAIN)
                sub = await drv.get_stream_url(ch.channel, StreamType.SUB)
                where = f"  (camera {ch.remote_address})" if ch.remote_address else ""
                print(f"{ch.channel:>3}  {ch.name}{where}\n     main: {main}\n     sub:  {sub}")
            if not in_use:
                return
            channel = args.channel or in_use[-1].channel

            if args.vendor == Vendor.DAHUA:
                from app.drivers.dahua import DahuaMedia
                from app.drivers.dahua.detect import detect_media

                if args.media == "auto":
                    media, rtsp = await detect_media(params, channel)
                    print(f"\n== Media path: {media.value}  (RTSP check on channel {channel}: {rtsp.status}"
                          f"{' ' + ','.join(rtsp.codecs) if rtsp.codecs else ''}) ==")
                else:
                    media = DahuaMedia(args.media)
                    print(f"\n== Media path: {media.value} (forced) ==")
                drv.media = media  # media is used lazily, so switching here is safe

            if args.snapshot:
                try:
                    jpeg = await drv.get_snapshot(channel)
                    await asyncio.to_thread(Path(args.snapshot).write_bytes, jpeg)
                    print(f"\nSaved snapshot of channel {channel} to {args.snapshot} ({len(jpeg) // 1024} KB)")
                except DriverError as e:
                    print(f"\nSnapshot not available: {e}")

            if args.record:
                await _record(drv, channel, args.record, args.out)

            if args.publish:
                await _publish(drv, channel, args.publish, args.publish_seconds)

            if args.events:
                print(f"\n== Listening for events for {args.events}s (walk in front of a camera) ==")
                try:
                    async with asyncio.timeout(args.events):
                        async for ev in drv.subscribe_events():
                            ai = "AI " if ev.is_ai else ""
                            print(f"{ev.occurred_at:%H:%M:%S}  ch={ev.channel}  {ai}{ev.type.value}/{ev.action.value}"
                                  f"  ({ev.vendor_code})")
                except TimeoutError:
                    pass
    except DriverError as e:
        sys.exit(f"Error: {e}")


async def _record(drv, channel: int, seconds: int, out: str) -> None:
    """Record the live sub stream to a file through the same path the media server will use."""
    from app.drivers import PushSource, StreamType
    from app.media.bridge import StreamBridge

    source = await drv.live_source(channel, StreamType.SUB)
    print(f"\n== Recording channel {channel} for {seconds}s -> {out} ==")
    if isinstance(source, PushSource):
        bridge = StreamBridge(source, output_args=["-c", "copy", "-y", out])
        await asyncio.to_thread(bridge.start)
        await asyncio.sleep(seconds)
        await asyncio.to_thread(bridge.stop)
        print(f"received {bridge.bytes_in // 1024} KB from the device, dropped chunks: {bridge.dropped_chunks}")
    else:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", source.url,
            "-t", str(seconds), "-map", "0:v", "-c", "copy", "-y", out,
        )
        await proc.wait()
    size = await asyncio.to_thread(lambda: Path(out).stat().st_size if Path(out).exists() else 0)
    print(f"output file: {size // 1024} KB")


async def _publish(drv, channel: int, url: str, seconds: int) -> None:
    """Push the live sub stream into a media server (e.g. MediaMTX) - what the stream worker will do in Phase 1."""
    from app.drivers import PushSource, StreamType
    from app.media.bridge import StreamBridge

    source = await drv.live_source(channel, StreamType.SUB)
    print(f"\n== Publishing channel {channel} to {url} for {seconds}s (Ctrl-C to stop) ==")
    if isinstance(source, PushSource):
        bridge = StreamBridge(source, publish_url=url)
        await asyncio.to_thread(bridge.start)
        try:
            for _ in range(seconds):
                await asyncio.sleep(1)
                if not bridge.running:
                    print("ffmpeg stopped - is the media server running?")
                    break
        finally:
            await asyncio.to_thread(bridge.stop)
        print(f"sent {bridge.bytes_in // 1024} KB, dropped chunks: {bridge.dropped_chunks}")
    else:  # plain RTSP device: in production MediaMTX pulls it itself; here we relay with ffmpeg
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-rtsp_transport", "tcp", "-i", source.url,
            "-t", str(seconds), "-map", "0:v", "-c", "copy", "-f", "rtsp", "-rtsp_transport", "tcp", url,
        )
        await proc.wait()


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("gen-keys", help="print new secret keys for .env").set_defaults(func=_gen_keys)

    p = sub.add_parser("create-admin", help="create an admin user")
    p.add_argument("--username", required=True)
    p.add_argument("--full-name", default="ผู้ดูแลระบบ")
    p.set_defaults(func=lambda a: asyncio.run(_create_admin(a)))

    p = sub.add_parser("probe", help="test a camera/NVR with its driver")
    p.add_argument("--vendor", default=Vendor.DAHUA.value, choices=[v.value for v in Vendor])
    p.add_argument("--host", required=True)
    p.add_argument("--user", required=True)
    p.add_argument("--http-port", type=int, default=80)
    p.add_argument("--rtsp-port", type=int, default=554)
    p.add_argument("--https", action="store_true")
    p.add_argument("--channel", type=int, help="channel to test (default: last channel with a camera)")
    p.add_argument("--media", choices=["auto", "rtsp", "netsdk"], default="auto",
                   help="Dahua: how to get video/events (auto = RTSP if it works, else NetSDK)")
    p.add_argument("--snapshot", metavar="FILE.jpg", help="save a snapshot")
    p.add_argument("--record", type=int, metavar="SECONDS", help="record the live sub stream this long")
    p.add_argument("--out", default="probe.mp4", help="file for --record (default probe.mp4)")
    p.add_argument("--events", type=int, metavar="SECONDS", help="listen for events this long")
    p.add_argument("--publish", metavar="RTSP_URL", help="push live video to a media server, e.g. "
                   "rtsp://127.0.0.1:8554/cam2 (then watch at http://127.0.0.1:8889/cam2)")
    p.add_argument("--publish-seconds", type=int, default=300, help="how long to publish (default 300)")
    p.set_defaults(func=lambda a: asyncio.run(_probe(a)))

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
