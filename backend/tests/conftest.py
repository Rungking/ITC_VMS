import os
import tempfile

# Must be set before any app module creates the engine.
_tmpdir = tempfile.mkdtemp(prefix="vms-test-")
os.environ["VMS_DATABASE_URL"] = f"sqlite+aiosqlite:///{_tmpdir}/test.db"
os.environ["VMS_SECRET_KEY"] = "test-secret-key-that-is-long-enough-for-hs256"

import httpx  # noqa: E402
import pytest  # noqa: E402

from app.core.db import Base, SessionLocal, engine  # noqa: E402
from app.core.enums import Role  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

PASSWORD = "correct-horse-1"


@pytest.fixture(scope="session", autouse=True)
async def database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with SessionLocal() as db:
        db.add_all([
            User(username="admin", password_hash=hash_password(PASSWORD), role=Role.ADMIN),
            User(username="viewer", password_hash=hash_password(PASSWORD), role=Role.VIEWER),
            User(username="disabled", password_hash=hash_password(PASSWORD), role=Role.ADMIN, is_active=False),
        ])
        await db.commit()
    yield
    await engine.dispose()


@pytest.fixture
async def client():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def login(client: httpx.AsyncClient, username: str, password: str = PASSWORD) -> httpx.Response:
    return await client.post("/api/auth/login", data={"username": username, "password": password})


async def auth_headers(client: httpx.AsyncClient, username: str) -> dict[str, str]:
    token = (await login(client, username)).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
