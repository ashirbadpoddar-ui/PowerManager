# PowerManage Project Knowledge Base

Last updated: 2026-09-01

Update this file whenever the implemented architecture, persistence model, API, or development conventions change.

## Overview

- **Product:** PowerManage is an electricity-operations dashboard for managing properties, meter readings, billing, invoices, and user access.
- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS, Lucide icons, Vitest, and Testing Library.
- **Backend:** FastAPI, SQLAlchemy, Alembic, PostgreSQL, Pydantic, and cookie-based authenticated sessions.
- **Roles:** Administrators manage users, theme/settings, tariffs, and workspace reset. Standard users can use the operational workspace but cannot access administrator-only actions.
- **Current UI:** A dark-first responsive dashboard with a light theme preference, a desktop sidebar, mobile drawer, properties, submitter billing, meter readings, billing/invoices, profile, user management, system settings, and a reports placeholder.

## Architecture and Persistence

- The browser calls FastAPI through `NEXT_PUBLIC_API_URL`; API requests include cookies and copy the CSRF cookie to `X-CSRF-Token` for mutations.
- Authentication uses opaque, revocable PostgreSQL sessions. The session cookie is HttpOnly; CSRF uses the double-submit-cookie pattern.
- PostgreSQL persists users, sessions, tariffs/slabs, billing runs, bills, properties, submitters, and meter readings.
- Properties and meter readings are owner-scoped. Billing visibility and permitted actions are enforced by the backend.
- Detailed billing stores a parent `billing_runs` reconciliation record and its generated invoices in `bills`. Simple and detailed generation accept idempotency keys to safely replay duplicate requests.
- Workspace/business data can be reset by an administrator without deleting users or sessions.

### Database migrations

Apply migrations from `electricity-bill-calculator/` with `python -m alembic upgrade head`.

| Revision | Purpose |
| --- | --- |
| `0001_create_users_and_sessions.py` | Users and revocable sessions |
| `0002_create_tariffs_and_bills.py` | Tariffs, tariff slabs, billing runs, and bills |
| `0003_independent_meter_billing.py` | Independent meter-billing support |
| `0004_create_properties_and_submitters.py` | Persisted properties and submitters |
| `0005_create_meter_readings.py` | Persisted property meter readings |

## API and Authorization

All operational routes require an authenticated active user who has completed any required password change. Mutating routes additionally require CSRF. Administrator routes require administrator role plus CSRF where they mutate state.

| Area | Routes | Notes |
| --- | --- | --- |
| Authentication | `/api/auth/bootstrap-status`, `/bootstrap`, `/login`, `/me`, `/change-password`, `/logout` | First-admin bootstrap, session lifecycle, profile and password management |
| Users | `/api/users` and `/api/users/{id}` | Administrator list/create/update/password-reset operations |
| Calculations | `POST /api/electricity/calculate`, `/calculate-detailed`, `/reset` | Stateless preview calculations and tariff-default reset |
| Tariff settings | `GET`/`PUT /api/electricity/settings` | Persisted tariff and slab configuration |
| Workspace reset | `POST /api/electricity/reset-workspace` | Administrator-only transactional business-data reset; preserves users and sessions and restores default tariffs |
| Bills | `POST /api/bills/simple`, `/detailed`; `GET /api/bills`; `POST /{id}/mark-paid`, `/{id}/void` | Persisted invoice generation, listing, payment, and voiding |
| Properties | `GET`/`POST /api/properties`, `PATCH`/`DELETE /api/properties/{id}`, submitter create/delete routes | Owner-scoped property and submitter CRUD |
| Meter readings | `GET`/`POST /api/meter-readings`, `PATCH`/`DELETE /api/meter-readings/{id}` | Owner-scoped readings; duplicate property/meter/date readings are rejected |

### Workspace reset

`POST /api/electricity/reset-workspace` executes in one transaction. It clears bills, billing runs, meter readings, properties, and cascade-owned submitters, then restores default tariffs. The response reports cleared counts. Users, authentication records, and the active administrator session are preserved.

## Frontend Behavior

- `frontend/src/app/page.tsx` owns authenticated view navigation, persisted-data refreshes, theme persistence, dashboard aggregation, and the responsive app shell.
- Theme preference is stored locally as `powermanage-theme` and applied through `data-theme` on the document root. Dark is the default; both users and administrators can choose dark or light.
- The desktop sidebar appears at `lg` and above. Smaller layouts use the mobile drawer, which closes on Escape and locks body scroll while open.
- Layouts protect against page-level horizontal overflow; invoice records stack into touch-friendly cards at small widths while wider data tables use scoped horizontal scrolling.
- `OwnerDashboard` previews and generates detailed invoices. Its success message has accessible dismiss and “Open Billing & Invoices” controls; the latter uses existing in-app navigation without reloading.
- The dashboard has no calculator or tariff navigation item. Billing calculations and tariff APIs remain available to their existing workflows.
- The dashboard’s restart-workspace card has been removed. Workspace reset is exposed only in System Settings for administrators and requires typing `RESET`.

## Key Files

| Path | Responsibility |
| --- | --- |
| `frontend/src/app/page.tsx` | Responsive authenticated shell, navigation, theme state, and view orchestration |
| `frontend/src/app/globals.css` | Dark/light design tokens, responsive overflow protection, dashboard card interaction styles |
| `frontend/src/components/` | Dashboard, billing, property, reading, profile, settings, and user-management interfaces |
| `frontend/src/services/` | Typed API wrappers and credential/CSRF request client |
| `electricity-bill-calculator/app/main.py` | FastAPI composition and CORS configuration |
| `electricity-bill-calculator/app/api/routes/` | Authentication, calculation, and settings endpoints |
| `electricity-bill-calculator/app/routes/` | Bills, users, properties, and meter-reading endpoints |
| `electricity-bill-calculator/app/models/` | SQLAlchemy models for users, sessions, tariffs, billing, properties, and readings |
| `electricity-bill-calculator/app/services/` | Authentication, tariff, calculation, and billing business logic |
| `electricity-bill-calculator/alembic/versions/` | PostgreSQL schema history |

## Development and Validation

### Frontend

From `frontend/`:

```powershell
npm ci
npm run dev
npm test
npm run lint
npm run build
```

- `npm test` runs 11 Vitest/Testing Library files, including responsive drawer, invoice-card, generated-bill shortcut, role-restriction, settings, and API-client coverage.
- `npm run build` performs the production Next.js build and TypeScript validation.
- `npm run lint` currently reports two pre-existing unused-variable warnings and no errors.

### Backend

From `electricity-bill-calculator/`:

```powershell
Copy-Item .env.example .env
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
python -m pytest
```

- `DATABASE_URL` is required at runtime and must use `postgresql+psycopg`.
- Backend integration tests require an isolated `TEST_DATABASE_URL`; they skip when it is unavailable.

## Current Limitations

- Reports and header search/notifications/support controls are not fully implemented workflows.
- A local PostgreSQL test database is required to execute backend integration tests.
- There is no CI/CD pipeline, deployment manifest, monitoring configuration, or documented backup/restore runbook.
- The responsive interface has automated behavior coverage, but full visual viewport review remains a manual release check.
- No Git metadata is present in this workspace, so branch/history state cannot be inferred here.
