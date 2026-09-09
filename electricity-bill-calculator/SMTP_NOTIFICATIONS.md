# Local invoice email setup

The backend local `.env` has been configured for the requested Gmail account.
The password is only in that ignored file; never copy it into source, logs,
frontend environment variables, or a commit. No live SMTP test was performed.

From PowerShell:

```powershell
cd "C:\Users\ashir\Electricity Bill\electricity-bill-calculator"
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Restart an already running backend to load the environment changes. For another
local checkout, preserve its database settings and add these backend `.env` keys:

```dotenv
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=ashirbadpoddar@gmail.com
MAIL_PASSWORD=<your Gmail App Password without display spaces>
MAIL_FROM=ashirbadpoddar@gmail.com
MAIL_FROM_NAME=PowerManage
MAIL_STARTTLS=true
MAIL_SSL_TLS=false
```

`MAIL_PASSWORD` requires a Gmail App Password for this setup, not the Google
account password. Create it in the Gmail account's Google Account security
settings with 2-Step Verification enabled. `MAIL_*` settings take precedence over
legacy `EMAIL_*` aliases. Port 587 always uses STARTTLS with implicit SSL disabled;
certificate verification remains enabled. Missing or invalid SMTP connection
configuration makes notifications unavailable without blocking invoice creation.

In a second PowerShell terminal:

```powershell
cd "C:\Users\ashir\Electricity Bill\frontend"
npm.cmd run dev
```

Sign in as an administrator, assign a user account to the property submitter,
and generate an invoice. This operation schedules an actual email when SMTP is
configured. Automated tests always mock SMTP; they never send real emails.

## Verification

Use only a dedicated disposable `TEST_DATABASE_URL`, different from `DATABASE_URL`.
The existing integration fixtures migrate and clear that test database.

```powershell
# From the backend directory
.\venv\Scripts\python.exe -m pytest tests/test_invoice_notifications.py tests/test_email_service.py tests/test_bills.py tests/test_auth.py tests/test_security_review.py -q -p no:cacheprovider
# From the frontend directory
npm.cmd test -- --run src/components/PropertyBilling.test.tsx src/components/OwnerDashboard.test.tsx
npx.cmd tsc --noEmit
npx.cmd eslint src/components/PropertyBilling.tsx src/components/PropertyBilling.test.tsx src/components/OwnerDashboard.tsx src/types/electricity.ts
```

## Behavior and limitations

Notifications use the saved invoice number, amount and due date, and the assigned
submitter account's email. HTML templates escape user-controlled text. Simple,
main-meter and other unassigned invoices report unavailable; a recipient label
is not an email address. No public email-sending endpoint was added.

`scheduled` means a FastAPI background task was attached after database commit,
not that Gmail accepted or delivered the message. Missing configuration or a
recipient yields `not_available`. Detailed idempotent replays return existing
invoices with no new notification status or task. Submitter duplicates retain
HTTP 409 behavior. SMTP failures do not roll back saved invoices.

Tasks receive an immutable dataclass of plain values, never a database session
or ORM instance. SMTP has a 10-second connection timeout and a 15-second overall
deadline. Logs omit SMTP exception details and recipient addresses.

BackgroundTasks is not durable: a process crash/restart, including the gap after
commit and before scheduling, can lose notifications. There is no retry queue,
delivery tracking, or exactly-once delivery guarantee. A transactional outbox and
durable worker would be needed for reliable retries. SMTP acceptance itself does
not prove inbox delivery. No deployment or production-data changes were made.

## Implementation verification results

- 34 relevant backend tests passed across notification, mail service, billing,
  authentication and security tests (33 in the combined run, plus the newly
  added deadline test; the final mail-service run passed all 8 tests).
- Both affected frontend test files passed: 8 tests total.
- A broader settings run found an existing unrelated failure:
  `test_workspace_reset_clears_business_records_and_keeps_administrator_session`
  submits a detailed invoice without the required `property_id` and receives 422.
  That fixture and production schema were left unchanged.
- Existing Starlette deprecation and npm configuration warnings remain.

Changed files:

- Backend: `app/core/config.py`, `app/services/email_service.py`,
  `app/routes/bills.py`, `app/schemas/bill.py`, `.env.example`, local ignored `.env`.
- Backend tests: `tests/conftest.py`, `tests/test_email_service.py`,
  `tests/test_bills.py`, `tests/test_invoice_notifications.py`.
- Frontend: `src/types/electricity.ts`, `src/components/PropertyBilling.tsx`,
  `src/components/PropertyBilling.test.tsx`, `src/components/OwnerDashboard.tsx`.
- Documentation: `SMTP_NOTIFICATIONS.md`.

FastAPI-Mail was already declared in `requirements.txt`; no dependency-file change
was necessary. No Git metadata was present, so an uncommitted diff could not be
identified; existing source was edited in place without resetting other work.

Final frontend checks: TypeScript (tsc --noEmit) and ESLint for all affected TypeScript files passed.
