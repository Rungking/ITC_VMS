"""Admin command line.

    python -m app.cli gen-keys
    python -m app.cli create-admin --username admin
    python -m app.cli probe --host 192.168.1.108 --user admin [--snapshot ch1.jpg] [--events 30]

`probe` talks to a real device without touching the database - use it in the lab to check
that a camera/NVR works with our driver. The device password is read from CCTV_PROBE_PASSWORD
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

    print(f"CCTV_SECRET_KEY={secrets.token_urlsafe(48)}")
    print(f"CCTV_CREDENTIALS_KEY={Fernet.generate_key().decode()}")


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

    password = os.environ.get("CCTV_PROBE_PASSWORD") or getpass.getpass(f"Password for {args.user}@{args.host}: ")
    params = ConnectionParams(host=args.host, username=args.user, password=password,
                              http_port=args.http_port, rtsp_port=args.rtsp_port, use_https=args.https)
    try:
        async with create_driver(Vendor(args.vendor), params) as drv:
            info = await drv.get_device_info()
            print(f"\n== Device ==\n{info.kind.value.upper()}  {info.model}  S/N {info.serial}  FW {info.firmware}")

            channels = await drv.list_channels()
            print(f"\n== Channels ({len(channels)}) ==")
            for ch in channels:
                main = await drv.get_stream_url(ch.channel, StreamType.MAIN)
                sub = await drv.get_stream_url(ch.channel, StreamType.SUB)
                print(f"{ch.channel:>3}  {ch.name}\n     main: {main}\n     sub:  {sub}")

            if args.snapshot and channels:
                jpeg = await drv.get_snapshot(channels[0].channel)
                await asyncio.to_thread(Path(args.snapshot).write_bytes, jpeg)
                print(f"\nSaved snapshot of channel {channels[0].channel} to {args.snapshot}")

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
    p.add_argument("--snapshot", metavar="FILE.jpg", help="save a snapshot of the first channel")
    p.add_argument("--events", type=int, metavar="SECONDS", help="listen for events this long")
    p.set_defaults(func=lambda a: asyncio.run(_probe(a)))

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
