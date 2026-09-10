# PowerManage Backend

FastAPI backend for authenticated electricity-bill calculations, PostgreSQL-backed user accounts, revocable sessions, tariff settings, and administrator user management.

## Requirements

- Python 3 (the repository does not pin a minor version)
- PostgreSQL
- A dedicated PostgreSQL database for development
- A separate PostgreSQL database for tests

## Configuration

For a Vercel frontend calling Render directly over HTTPS, set Render's
`APP_ENV=production`, `SESSION_COOKIE_SECURE=true`,
`SESSION_COOKIE_SAMESITE=none`, and `CORS_ORIGINS` to the exact frontend origin
(scheme and hostname, without a path). Keep `RATE_LIMIT_ENABLED=true`.
Do not configure a cookie Domain across the two hosts. Cookies stay host-only.
`SameSite=None` is rejected unless Secure is enabled. Without an explicit
SameSite setting, production/staging use `none` and local development uses `lax`.

The HttpOnly session token is never exposed to JavaScript. Login, bootstrap,
password rotation and GET `/api/auth/me` return `X-CSRF-Token`, exposed only to
CORS-allowed origins. The frontend retains that CSRF token in memory and sends
it on mutations; the backend still verifies it against both cookie and session.
On reload, GET `/api/auth/me` restores the token. No localStorage is used.

After deploying both services, sign in again and verify cookie storage and
`/api/auth/me` in browser DevTools, including after 30 seconds and a page reload.
Browsers blocking third-party cookies can still block this cross-site setup;
use a same-origin proxy or same-site custom domains in that case.

Copy `.env.example` to `.env` and set every environment-specific value. Never reuse the application database as the test database.

| Variable | Purpose |
| --- | --- |
| `APP_NAME` | OpenAPI application name |
| `APP_VERSION` | OpenAPI application version |
| `APP_ENV` | `development`, `test`, `staging`, or `production` |
| `DATABASE_URL` | Required `postgresql+psycopg` application connection URL |
| `TEST_DATABASE_URL` | Dedicated integration-test connection URL |
| `BOOTSTRAP_TOKEN` | One-time setup credential for the first administrator |
| `CORS_ORIGINS` | Comma-separated trusted frontend origins |
| `SESSION_TTL_HOURS` | Database-session lifetime |
| `SESSION_COOKIE_SECURE` | Enables Secure cookies for HTTPS deployments |
| `RATE_LIMIT_ENABLED` | Enables the process-local sensitive-endpoint limiter; required outside development |

Never put SMTP credentials, database passwords, or bootstrap tokens in frontend
environment variables. The checked-in example contains placeholders only. In
staging/production, use HTTPS, `SESSION_COOKIE_SECURE=true`, a strong one-time
bootstrap token, and `RATE_LIMIT_ENABLED=true`.

## Install and migrate

```powershell
python -m pip install -r requirements.txt
python -m alembic upgrade head
```

Alembic is the only schema-management mechanism. The legacy `electricity.db` SQLite artifact is not used or migrated.

## Run locally

```powershell
python -m uvicorn app.main:app --reload
```

- Swagger UI: `http://127.0.0.1:8000/docs`
- ReDoc: `http://127.0.0.1:8000/redoc`

The frontend must send cookies with API requests. Authenticated mutations also send the CSRF value from the `powermanage_csrf` cookie in the `X-CSRF-Token` header.

Demo payment status and receipt metadata are persisted on the server-side bill
record. Browser localStorage may retain only a convenience cache of demo
metadata; it is not trusted persistence and is not suitable for real payment
data.

## Initial administrator

On an empty database, `GET /api/auth/bootstrap-status` reports that setup is required. The bootstrap form/API requires the configured `BOOTSTRAP_TOKEN`. Once the first administrator exists, bootstrap is permanently rejected; rotate or remove the setup token after initialization.

## Authorization

- Public: bootstrap status, first-administrator bootstrap, and login.
- Authenticated users: own profile/password, logout, and electricity calculations.
- Administrators: tariff read/update/reset and user listing/creation/update/password reset.
- Accounts created or reset by an administrator must change their temporary password before using operational APIs.

## Tests

Set `TEST_DATABASE_URL` to a dedicated PostgreSQL database, then run:

```powershell
python -m pytest
```

The test harness rejects a test URL that matches `DATABASE_URL`, applies Alembic migrations, and isolates database/tariff state between tests. Without `TEST_DATABASE_URL`, the integration suite skips rather than connecting to another database. PostgreSQL is required; there is no SQLite fallback.

## Production order

1. Provision PostgreSQL and configure environment variables.
2. Run `python -m alembic upgrade head`.
3. Deploy/start the FastAPI service.
4. Deploy the frontend with its API base URL.
5. Bootstrap the first administrator and retire the bootstrap token.
