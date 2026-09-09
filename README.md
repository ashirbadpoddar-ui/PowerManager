<<<<<<< HEAD
# PowerManager
=======
# PowerManage

PowerManage is a Next.js and FastAPI application for authenticated electricity-bill calculations, account administration, and tariff management. PostgreSQL stores user accounts and revocable sessions; tariff slabs currently remain in a backend JSON file.

See `brain.md` for the full architecture, schema, API inventory, conventions, and known limitations.

## Prerequisites

- Python 3
- Node.js and npm
- Externally supplied PostgreSQL databases for the application and backend tests

SQLite is not supported. The backend's existing `electricity.db` is an unused legacy artifact.

## Backend setup

From `electricity-bill-calculator/`:

```powershell
Copy-Item .env.example .env
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

Configure the environment names documented in `.env.example`. `DATABASE_URL` and `TEST_DATABASE_URL` must use `postgresql+psycopg://`; the two URLs must identify different databases. Set `BOOTSTRAP_TOKEN` before first setup. It can be removed after the first administrator exists.

## Frontend setup

From `frontend/` in another terminal:

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. The application displays first-administrator setup for an empty database and login thereafter. Local development sends browser requests to same-origin `/api/...` paths; a Next.js proxy forwards them to the backend configured by `BACKEND_URL` (default: `http://127.0.0.1:8000`). If the backend is down, the proxy returns a clear `503 Service Unavailable` response. Restart the frontend after changing `BACKEND_URL`. `NEXT_PUBLIC_API_URL` is optional and only for deployments that require direct browser-to-API requests.

## Tests and checks

Backend tests require a dedicated PostgreSQL URL in `TEST_DATABASE_URL`. They run migrations and refuse to use the same URL as the application database.

```powershell
cd electricity-bill-calculator
python -m pytest
```

Frontend tests, type checking, and production build:

```powershell
cd frontend
npm test
npx tsc --noEmit
npm run lint
npm run build
```

## Deployment order

1. Provision external PostgreSQL and configure backend/frontend environment variables.
2. Run `python -m alembic upgrade head` against the application database.
3. Deploy the backend.
4. Build and deploy the frontend with its API URL.
5. Bootstrap the first administrator.
6. Rotate or remove `BOOTSTRAP_TOKEN` and enable `SESSION_COOKIE_SECURE` for HTTPS.

The frontend and backend must be deployed in a cookie-compatible same-site arrangement. Configure exact trusted frontend origins through `CORS_ORIGINS`; wildcard credentialed CORS is rejected.
>>>>>>> 7ab3a64 (Initial commit)
