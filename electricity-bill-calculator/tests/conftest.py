from __future__ import annotations

import os
from collections.abc import Callable, Generator
from decimal import Decimal
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import text
from sqlalchemy.engine import make_url


BACKEND_ROOT = Path(__file__).resolve().parents[1]


class _DatabaseTestEnvironment(BaseSettings):
    database_url: str | None = None
    test_database_url: str | None = None

    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


_database_environment = _DatabaseTestEnvironment()
TEST_DATABASE_URL = (_database_environment.test_database_url or "").strip()
APPLICATION_DATABASE_URL = (_database_environment.database_url or "").strip()


def _canonical_database_url(value: str) -> str:
    return make_url(value).render_as_string(hide_password=False)


if TEST_DATABASE_URL:
    if not TEST_DATABASE_URL.startswith("postgresql+psycopg://"):
        raise pytest.UsageError(
            "TEST_DATABASE_URL must use the postgresql+psycopg:// dialect"
        )
    if (
        APPLICATION_DATABASE_URL
        and _canonical_database_url(TEST_DATABASE_URL)
        == _canonical_database_url(APPLICATION_DATABASE_URL)
    ):
        raise pytest.UsageError(
            "Refusing to run: TEST_DATABASE_URL and DATABASE_URL identify the same database"
        )
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
else:
    # This syntactically valid URL lets tests collect without accidentally falling
    # back to SQLite. The session fixture skips before any connection is attempted.
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://missing:missing@127.0.0.1:1/powermanage_missing_test_database",
    )

os.environ.setdefault("BOOTSTRAP_TOKEN", "test-bootstrap-token-with-sufficient-entropy")
os.environ.setdefault("CORS_ORIGINS", "http://testserver")
os.environ.setdefault("SESSION_TTL_HOURS", "168")
os.environ.setdefault("SESSION_COOKIE_SECURE", "false")

# Imports must follow the environment safeguards above because application settings
# and the SQLAlchemy engine are intentionally constructed at import time.
from app.core.config import settings  # noqa: E402
from app.core.security import hash_token  # noqa: E402
from app.database.connection import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models.session import UserSession  # noqa: E402
from app.models.tariff import Tariff, TariffSlab  # noqa: E402


@pytest.fixture(scope="session")
def migrated_test_database() -> Generator[None, None, None]:
    if not TEST_DATABASE_URL:
        pytest.skip("PostgreSQL integration tests require a dedicated TEST_DATABASE_URL")

    alembic_config = Config(str(BACKEND_ROOT / "alembic.ini"))
    command.upgrade(alembic_config, "head")
    yield
    engine.dispose()


@pytest.fixture
def isolated_state(migrated_test_database: None) -> Generator[None, None, None]:
    with engine.begin() as connection:
        connection.execute(
            text(
                "TRUNCATE TABLE meter_readings, bills, billing_runs, tariff_slabs, tariffs, "
                "sessions, users RESTART IDENTITY CASCADE"
            )
        )

    with SessionLocal() as database:
        tariff = Tariff(version=1, name="Test tariff", is_active=True)
        database.add(tariff)
        database.flush()
        database.add_all(
            [
                TariffSlab(
                    tariff_id=tariff.id,
                    position=0,
                    min_units=Decimal("0"),
                    max_units=Decimal("100"),
                    rate_per_unit=Decimal("5"),
                ),
                TariffSlab(
                    tariff_id=tariff.id,
                    position=1,
                    min_units=Decimal("100"),
                    max_units=Decimal("200"),
                    rate_per_unit=Decimal("7.5"),
                ),
                TariffSlab(
                    tariff_id=tariff.id,
                    position=2,
                    min_units=Decimal("200"),
                    max_units=None,
                    rate_per_unit=Decimal("10"),
                ),
            ]
        )
        database.commit()
    try:
        yield
    finally:
        with engine.begin() as connection:
            connection.execute(
                text(
                "TRUNCATE TABLE meter_readings, bills, billing_runs, tariff_slabs, tariffs, "
                    "sessions, users RESTART IDENTITY CASCADE"
                )
            )


@pytest.fixture
def client(isolated_state: None) -> Generator[TestClient, None, None]:
    with TestClient(app, base_url="http://testserver") as test_client:
        yield test_client


@pytest.fixture
def csrf_headers() -> Callable[[TestClient], dict[str, str]]:
    def build(test_client: TestClient) -> dict[str, str]:
        token = test_client.cookies.get("powermanage_csrf")
        assert token, "The test client has no CSRF cookie"
        return {"X-CSRF-Token": token}

    return build


@pytest.fixture
def bootstrap_admin() -> Callable[..., tuple[TestClient, dict[str, object]]]:
    def bootstrap(
        test_client: TestClient,
        *,
        name: str = "Initial Administrator",
        email: str = "admin@example.com",
        password: str = "CorrectHorseBattery1!",
    ) -> tuple[TestClient, dict[str, object]]:
        response = test_client.post(
            "/api/auth/bootstrap",
            json={
                "setup_token": settings.bootstrap_token.get_secret_value(),
                "name": name,
                "email": email,
                "password": password,
            },
        )
        assert response.status_code == 201, response.text
        return test_client, response.json()

    return bootstrap


@pytest.fixture
def create_managed_user(
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> Callable[..., dict[str, object]]:
    def create(
        admin_client: TestClient,
        *,
        name: str = "Regular User",
        email: str = "user@example.com",
        password: str = "TemporaryPassword1!",
        role: str = "user",
    ) -> dict[str, object]:
        response = admin_client.post(
            "/api/users",
            headers=csrf_headers(admin_client),
            json={
                "name": name,
                "email": email,
                "password": password,
                "role": role,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    return create


def session_row_for_client(test_client: TestClient) -> UserSession | None:
    raw_token = test_client.cookies.get("powermanage_session")
    if not raw_token:
        return None
    with SessionLocal() as database:
        row = database.query(UserSession).filter_by(token_hash=hash_token(raw_token)).one_or_none()
        if row is not None:
            database.expunge(row)
        return row


__all__ = ["SessionLocal", "session_row_for_client"]


@pytest.fixture(autouse=True)
def mock_smtp(monkeypatch):
    """Never contact SMTP, even when local .env contains real credentials."""
    from unittest.mock import AsyncMock
    from pydantic import SecretStr
    monkeypatch.setattr(settings, "email_username", "admin@example.com")
    monkeypatch.setattr(settings, "email_password", SecretStr("test-app-password"))
    monkeypatch.setattr(settings, "email_from", "admin@example.com")
    sender = AsyncMock()
    monkeypatch.setattr("fastapi_mail.FastMail.send_message", sender)
    return sender
