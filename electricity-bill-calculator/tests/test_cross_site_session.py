import time

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.core.config import Settings, settings


def test_none_cookies_require_secure():
    with pytest.raises(ValidationError, match="SESSION_COOKIE_SECURE"):
        Settings(_env_file=None, database_url="postgresql+psycopg://test:test@localhost/test",
                 session_cookie_secure=False, session_cookie_samesite="none")


def test_https_session_survives_wait_reload_and_logout(client, bootstrap_admin, monkeypatch):
    bootstrap_admin(client)
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "session_cookie_secure", True)
    monkeypatch.setattr(settings, "session_cookie_samesite", "none")
    with TestClient(client.app, base_url="https://backend.example") as browser:
        response = browser.post("/api/auth/login", headers={"Origin": "http://testserver"},
                                json={"email": "admin@example.com", "password": "CorrectHorseBattery1!"})
        assert response.status_code == 200
        cookies = response.headers.get_list("set-cookie")
        assert len(cookies) == 2
        assert all("Secure" in cookie and "SameSite=none" in cookie and "Path=/" in cookie
                   and "Domain=" not in cookie for cookie in cookies)
        assert "HttpOnly" in next(cookie for cookie in cookies if cookie.startswith("powermanage_session="))
        assert response.headers["access-control-allow-origin"] == "http://testserver"
        assert response.headers["access-control-allow-credentials"] == "true"
        assert "X-CSRF-Token" in response.headers["access-control-expose-headers"]
        csrf = response.headers["x-csrf-token"]
        me = browser.get("/api/auth/me")
        assert me.status_code == 200
        assert "powermanage_session=" in me.request.headers["cookie"]
        assert me.headers["x-csrf-token"] == csrf
        # Actual elapsed time, not just an expiration timestamp assertion.
        time.sleep(30)
        assert browser.get("/api/auth/me").status_code == 200
        with TestClient(client.app, base_url="https://backend.example", cookies=browser.cookies) as reloaded:
            me = reloaded.get("/api/auth/me")
            assert me.status_code == 200
            assert reloaded.post("/api/auth/logout").status_code == 403
            response = reloaded.post("/api/auth/logout", headers={"X-CSRF-Token": me.headers["x-csrf-token"]})
            assert response.status_code == 204
            assert all("Max-Age=0" in cookie and "SameSite=none" in cookie and "Secure" in cookie
                       for cookie in response.headers.get_list("set-cookie"))
            assert reloaded.get("/api/auth/me").status_code == 401
        assert browser.get("/api/auth/me").status_code == 401
