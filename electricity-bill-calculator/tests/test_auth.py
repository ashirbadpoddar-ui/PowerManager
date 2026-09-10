from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from fastapi import Response
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_token
from app.models.session import UserSession
from app.models.user import User
from app.services.auth_service import SessionCredentials, set_auth_cookies
from tests.conftest import SessionLocal, session_row_for_client


def test_bootstrap_status_uses_exactly_one_auth_prefix(client: TestClient) -> None:
    response = client.get("/api/auth/bootstrap-status", follow_redirects=False)
    assert response.status_code == 200
    assert response.json() == {"setup_required": True}
    assert client.get("/bootstrap-status").status_code == 404
    assert client.get("/api/auth/api/auth/bootstrap-status").status_code == 404


def test_atomic_bootstrap_creates_exactly_one_administrator(client: TestClient) -> None:
    assert client.get("/api/auth/bootstrap-status").json() == {"setup_required": True}
    invalid = client.post(
        "/api/auth/bootstrap",
        json={
            "setup_token": "wrong-token",
            "name": "Wrong Token",
            "email": "wrong@example.com",
            "password": "CorrectHorseBattery1!",
        },
    )
    assert invalid.status_code == 403

    def attempt(index: int) -> int:
        with TestClient(client.app, base_url="http://testserver") as concurrent_client:
            response = concurrent_client.post(
                "/api/auth/bootstrap",
                json={
                    "setup_token": settings.bootstrap_token.get_secret_value(),
                    "name": f"Admin {index}",
                    "email": f"admin{index}@example.com",
                    "password": "CorrectHorseBattery1!",
                },
            )
            return response.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(attempt, (1, 2)))

    assert statuses == [201, 409]
    with SessionLocal() as database:
        assert database.scalar(select(func.count(User.id))) == 1
        administrator = database.scalar(select(User))
        assert administrator is not None
        assert administrator.role == "administrator"
        assert administrator.password_hash.startswith("$argon2id$")
    assert client.get("/api/auth/bootstrap-status").json() == {"setup_required": False}


def test_bootstrap_normalizes_identity_sets_cookies_and_stores_only_hashes(
    client: TestClient,
    bootstrap_admin: Callable,
    monkeypatch,
) -> None:
    _, user = bootstrap_admin(client, name="  Alice Admin  ", email="  ALICE@EXAMPLE.COM ")
    assert user["name"] == "Alice Admin"
    assert user["email"] == "alice@example.com"

    response = Response()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=168)
    set_auth_cookies(
        response,
        SessionCredentials("raw-session", "raw-csrf", expires_at),
    )
    cookie_headers = response.headers.getlist("set-cookie")
    session_cookie = next(value for value in cookie_headers if value.startswith("powermanage_session="))
    csrf_cookie = next(value for value in cookie_headers if value.startswith("powermanage_csrf="))
    assert "HttpOnly" in session_cookie
    assert "SameSite=lax" in session_cookie
    assert "Path=/" in session_cookie
    assert "Max-Age=604800" in session_cookie
    assert "HttpOnly" not in csrf_cookie
    assert "SameSite=lax" in csrf_cookie

    monkeypatch.setattr(settings, "session_cookie_secure", True)
    secure_response = Response()
    set_auth_cookies(
        secure_response,
        SessionCredentials("secure-session", "secure-csrf", expires_at),
    )
    assert all(
        "Secure" in value for value in secure_response.headers.getlist("set-cookie")
    )

    database_session = session_row_for_client(client)
    assert database_session is not None
    assert database_session.token_hash != client.cookies.get("powermanage_session")
    assert database_session.csrf_token_hash != client.cookies.get("powermanage_csrf")
    assert len(database_session.token_hash) == 64
    assert len(database_session.csrf_token_hash) == 64


def test_login_lockout_is_generic_and_lasts_fifteen_minutes(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
) -> None:
    bootstrap_admin(client)
    created = create_managed_user(client)

    unknown = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "wrong-password"},
    )
    assert unknown.status_code == 401
    assert unknown.json()["detail"] == "Invalid email or password"

    for _ in range(5):
        wrong = client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "wrong-password"},
        )
        assert wrong.status_code == 401
        assert wrong.json()["detail"] == unknown.json()["detail"]

    correct_but_locked = client.post(
        "/api/auth/login",
        json={"email": "user@example.com", "password": "TemporaryPassword1!"},
    )
    assert correct_but_locked.status_code == 401
    assert correct_but_locked.json()["detail"] == unknown.json()["detail"]

    with SessionLocal() as database:
        account = database.get(User, created["id"])
        assert account is not None
        assert account.failed_login_count == 5
        assert account.locked_until is not None
        lock_duration = account.locked_until - datetime.now(timezone.utc)
        assert timedelta(minutes=14) < lock_duration <= timedelta(minutes=15)


def test_profile_updates_persist_and_email_changes_require_password(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    create_managed_user(client, email="duplicate@example.com")

    renamed = client.patch(
        "/api/auth/me",
        headers=csrf_headers(client),
        json={"name": "  Persisted Name  "},
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Persisted Name"

    missing_password = client.patch(
        "/api/auth/me",
        headers=csrf_headers(client),
        json={"email": "new-admin@example.com"},
    )
    assert missing_password.status_code == 400

    changed = client.patch(
        "/api/auth/me",
        headers=csrf_headers(client),
        json={
            "email": "  NEW-ADMIN@EXAMPLE.COM ",
            "current_password": "CorrectHorseBattery1!",
        },
    )
    assert changed.status_code == 200
    assert changed.json()["email"] == "new-admin@example.com"
    assert client.get("/api/auth/me").json()["name"] == "Persisted Name"

    duplicate = client.patch(
        "/api/auth/me",
        headers=csrf_headers(client),
        json={
            "email": "duplicate@example.com",
            "current_password": "CorrectHorseBattery1!",
        },
    )
    assert duplicate.status_code == 409


def test_password_change_revokes_other_sessions_and_logout_revokes_current_session(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    create_managed_user(client)

    with (
        TestClient(client.app, base_url="http://testserver") as first,
        TestClient(client.app, base_url="http://testserver") as second,
    ):
        credentials = {"email": "user@example.com", "password": "TemporaryPassword1!"}
        assert first.post("/api/auth/login", json=credentials).status_code == 200
        assert second.post("/api/auth/login", json=credentials).status_code == 200

        changed = first.post(
            "/api/auth/change-password",
            headers=csrf_headers(first),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        )
        assert changed.status_code == 200
        assert first.get("/api/auth/me").status_code == 200
        assert second.get("/api/auth/me").status_code == 401

        logout = first.post("/api/auth/logout", headers=csrf_headers(first))
        assert logout.status_code == 204
        assert not logout.content
        assert first.get("/api/auth/me").status_code == 401


def test_expired_sessions_are_rejected_and_cleaned(
    client: TestClient,
    bootstrap_admin: Callable,
) -> None:
    bootstrap_admin(client)
    raw_token = client.cookies.get("powermanage_session")
    assert raw_token
    token_hash = hash_token(raw_token)

    with SessionLocal() as database:
        user_session = database.scalar(
            select(UserSession).where(UserSession.token_hash == token_hash)
        )
        assert user_session is not None
        user_session.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        database.commit()

    assert client.get("/api/auth/me").status_code == 401
    with SessionLocal() as database:
        assert database.scalar(
            select(UserSession).where(UserSession.token_hash == token_hash)
        ) is None


def test_administrator_reset_and_deactivation_revoke_user_sessions(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    created = create_managed_user(client)

    with TestClient(client.app, base_url="http://testserver") as user_client:
        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        ).status_code == 200

        reset = client.post(
            f"/api/users/{created['id']}/reset-password",
            headers=csrf_headers(client),
            json={"password": "ResetTemporaryPass3!"},
        )
        assert reset.status_code == 204
        assert user_client.get("/api/auth/me").status_code == 401

        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "ResetTemporaryPass3!"},
        ).status_code == 200

        deactivated = client.patch(
            f"/api/users/{created['id']}",
            headers=csrf_headers(client),
            json={"is_active": False},
        )
        assert deactivated.status_code == 200
        assert deactivated.json()["is_active"] is False
        assert user_client.get("/api/auth/me").status_code == 401
        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "ResetTemporaryPass3!"},
        ).status_code == 401
