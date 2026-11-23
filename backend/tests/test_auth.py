from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import AuditLog
from tests.conftest import auth_headers, login


async def test_health(client):
    assert (await client.get("/api/health")).json() == {"status": "ok"}


async def test_login_success_returns_token_and_user(client):
    r = await login(client, "admin")
    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["role"] == "admin"


async def test_login_wrong_password_is_rejected_and_audited(client):
    r = await login(client, "admin", "wrong-password")
    assert r.status_code == 401
    async with SessionLocal() as db:
        actions = (await db.scalars(select(AuditLog.action).where(AuditLog.username == "admin"))).all()
    assert "auth.login_failed" in actions


async def test_unknown_and_disabled_users_cannot_log_in(client):
    assert (await login(client, "nobody")).status_code == 401
    assert (await login(client, "disabled")).status_code == 401


async def test_me_requires_valid_token(client):
    assert (await client.get("/api/auth/me")).status_code == 401
    bad = {"Authorization": "Bearer not-a-token"}
    assert (await client.get("/api/auth/me", headers=bad)).status_code == 401
    r = await client.get("/api/auth/me", headers=await auth_headers(client, "viewer"))
    assert r.json()["username"] == "viewer"


async def test_only_admin_can_manage_users(client):
    viewer = await auth_headers(client, "viewer")
    assert (await client.get("/api/users", headers=viewer)).status_code == 403

    admin = await auth_headers(client, "admin")
    r = await client.post("/api/users", headers=admin,
                          json={"username": "somchai", "password": "password123", "role": "operator"})
    assert r.status_code == 201
    assert r.json()["role"] == "operator"

    dup = await client.post("/api/users", headers=admin, json={"username": "somchai", "password": "password123"})
    assert dup.status_code == 409

    assert (await login(client, "somchai", "password123")).status_code == 200


async def test_admin_cannot_disable_self(client):
    admin = await auth_headers(client, "admin")
    me = (await client.get("/api/auth/me", headers=admin)).json()
    r = await client.patch(f"/api/users/{me['id']}", headers=admin, json={"is_active": False})
    assert r.status_code == 400
