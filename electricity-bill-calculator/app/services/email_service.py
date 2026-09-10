"""Server-side PowerManage email notifications using FastAPI-Mail."""

from __future__ import annotations

import asyncio
import html
import logging
import re
import smtplib
import ssl
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import List, cast
from collections.abc import Awaitable, Callable

import httpx
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import BaseModel, EmailStr, SecretStr

from app.core.config import settings

logger = logging.getLogger(__name__)
notification_logger = logging.getLogger("uvicorn.error.notifications")
RESEND_EMAILS_URL = "https://api.resend.com/emails"


class EmailApiResponseError(RuntimeError):
    """A deliberately detail-free error for a rejected provider response."""

    def __init__(self, status_code: int) -> None:
        super().__init__(f"Email API returned HTTP {status_code}")

# SMTP libraries can include a recipient, credentials, or a connection URI in
# an exception message. Render logs are operationally useful, but must never
# become a source of credentials or personal data.
_EMAIL_ADDRESS_PATTERN = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
_URI_CREDENTIAL_PATTERN = re.compile(r"([a-z][a-z0-9+.-]*://)([^\s:/@]+):([^\s/@]+)@", re.IGNORECASE)
_SENSITIVE_ASSIGNMENT_PATTERN = re.compile(
    r"\b(mail[_ -]?password|password|app[_ -]?password|bootstrap[_ -]?token|"
    r"session(?:[_ -]?(?:cookie|token))?|cookie|database(?:[_ -]?(?:url|password))?|"
    r"authorization|api[_ -]?key|secret)\b\s*(?:=|:)\s*([^\s,;]+)",
    re.IGNORECASE,
)
_SENSITIVE_TOKEN_PATTERN = re.compile(r"\b(?:secret|password|token|credential)[-_][A-Z0-9_-]+\b", re.IGNORECASE)


def _safe_exception_detail(error: BaseException) -> str:
    """Return an actionable exception message with sensitive values removed."""
    detail = str(error).strip() or "no exception message"
    detail = _URI_CREDENTIAL_PATTERN.sub(r"\1<redacted>:<redacted>@", detail)
    detail = _SENSITIVE_ASSIGNMENT_PATTERN.sub(lambda match: f"{match.group(1)}=<redacted>", detail)
    detail = _SENSITIVE_TOKEN_PATTERN.sub("<redacted>", detail)
    detail = _EMAIL_ADDRESS_PATTERN.sub("<email-redacted>", detail)
    return detail[:500]


def _smtp_failure_category(error: BaseException) -> str:
    if isinstance(error, (asyncio.TimeoutError, TimeoutError)):
        return "smtp_timeout"
    if isinstance(error, smtplib.SMTPAuthenticationError):
        return "smtp_authentication_failed"
    if isinstance(error, smtplib.SMTPRecipientsRefused):
        return "smtp_recipient_rejected"
    if isinstance(error, ssl.SSLError):
        return "smtp_tls_error"
    if isinstance(error, (ConnectionRefusedError, ConnectionError, OSError)):
        return "smtp_connection_failed"
    return "smtp_send_failed"


def _email_api_failure_category(error: BaseException) -> str:
    if isinstance(error, (httpx.TimeoutException, asyncio.TimeoutError, TimeoutError)):
        return "email_api_timeout"
    if isinstance(error, httpx.RequestError):
        return "email_api_connection_failed"
    if isinstance(error, EmailApiResponseError):
        return "email_api_rejected"
    return "email_api_send_failed"


def _log_email_exception(event: str, error: BaseException, *, category: str | None = None) -> None:
    """Log a useful SMTP failure without emitting an unsafe raw traceback."""
    notification_logger.error(
        "%s category=%s exception_type=%s detail=%s",
        event,
        category or (_email_api_failure_category(error) if settings.email_transport == "resend" else _smtp_failure_category(error)),
        type(error).__name__,
        _safe_exception_detail(error),
    )

class EmailSchema(BaseModel):
    email: List[EmailStr]

class EmailStatus(StrEnum):
    SCHEDULED = "scheduled"
    SENT = "sent"
    FAILED = "failed"
    NOT_AVAILABLE = "not_available"
    
    


@dataclass(frozen=True)
class InvoiceEmailData:
    user_name: str
    user_email: str | None
    invoice_id: str
    property_name: str | None
    billing_period: str
    previous_reading: object | None
    current_reading: object | None
    units: object
    rate: object | None
    total_amount: object
    due_date: str


@dataclass(frozen=True)
class PaymentEmailData:
    user_name: str
    user_email: str | None
    invoice_id: str
    paid_amount: object
    payment_method: str
    transaction_id: str
    paid_at: str


@dataclass(frozen=True)
class ReminderEmailData:
    user_name: str
    user_email: str | None
    invoice_id: str
    amount: object
    due_date: str
    reminder_type: str


def log_notification_failure(kind: str, invoice_id: object, error: Exception) -> None:
    notification_logger.error(
        "%s_email_failed invoice_id=%s status=failed exception_type=%s detail=%s",
        kind,
        invoice_id,
        type(error).__name__,
        _safe_exception_detail(error),
    )


async def deliver_notification(
    sender: Callable[..., Awaitable[EmailStatus | bool]],
    data: InvoiceEmailData | PaymentEmailData,
    kind: str,
) -> EmailStatus:
    notification_logger.info("%s_email_attempt invoice_id=%s recipient=%s", kind, data.invoice_id, data.user_email)
    try:
        result = await sender(data)
    except Exception as error:
        log_notification_failure(kind, data.invoice_id, error)
        return EmailStatus.FAILED
    if result is True or result == EmailStatus.SENT:
        notification_logger.info("%s_email_sent invoice_id=%s", kind, data.invoice_id)
        return EmailStatus.SENT
    notification_logger.warning("%s_email_failed invoice_id=%s status=%s", kind, data.invoice_id,
                                "not_available" if result == EmailStatus.NOT_AVAILABLE else "failed")
    return EmailStatus.NOT_AVAILABLE if result == EmailStatus.NOT_AVAILABLE else EmailStatus.FAILED


def _money(value: object) -> str:
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
        return f"\u20b9{amount:,.2f}"
    except Exception:
        return "\u20b90.00"


def _value(value: object | None) -> str:
    if value is None:
        return "Not available"
    try:
        return format(Decimal(str(value)).normalize(), "f")
    except Exception:
        return str(value)


def _smtp_is_configured() -> bool:
    password = settings.email_password.get_secret_value() if settings.email_password else ""
    return all(value and str(value).strip() for value in (settings.email_host, settings.email_username, password, settings.email_from))


def _email_api_is_configured() -> bool:
    api_key = settings.email_api_key.get_secret_value() if settings.email_api_key else ""
    return bool(api_key.strip() and settings.email_from and settings.email_from.strip())


def _connection_config() -> ConnectionConfig | None:
    if not _smtp_is_configured():
        logger.warning("Email credentials are not configured.")
        return None
    email_password = settings.email_password.get_secret_value() if settings.email_password else ""
    try:
        return ConnectionConfig(
            MAIL_USERNAME=settings.email_username or "",
            MAIL_PASSWORD=SecretStr(email_password),
            MAIL_FROM=cast(EmailStr, settings.email_from),
            MAIL_PORT=settings.email_port,
            MAIL_SERVER=settings.email_host,
            MAIL_FROM_NAME=settings.email_from_name,
            MAIL_STARTTLS=True if settings.email_port == 587 else settings.mail_starttls,
            MAIL_SSL_TLS=False if settings.email_port == 587 else settings.mail_ssl_tls,
            USE_CREDENTIALS=True,
            VALIDATE_CERTS=True,
            TIMEOUT=10,
            MAIL_DEBUG=0,
        )
    except Exception as error:
        _log_email_exception(
            "fastapi_mail_configuration_failed",
            error,
            category="fastapi_mail_configuration_error",
        )
        return None


async def send_email(receiver_email: str | None, subject: str, html_body: str) -> bool:
    """Send HTML email with Resend HTTPS in production, SMTP only for local use."""
    if not receiver_email or not receiver_email.strip():
        logger.warning("No email address available for this user.")
        return False

    if settings.email_transport == "resend":
        return await _send_via_resend(receiver_email, subject, html_body)

    config = _connection_config()
    if config is None:
        return False

    try:
        message = MessageSchema(
            subject=subject,
            recipients=[receiver_email.strip()],
            body=html_body,
            subtype=MessageType.html,
        )
        await asyncio.wait_for(FastMail(config).send_message(message), timeout=15)
        logger.info("Email notification sent.")
        return True
    except Exception as error:
        _log_email_exception("email_notification_failed", error)
        return False


async def _send_via_resend(receiver_email: str, subject: str, html_body: str) -> bool:
    """Deliver through Resend's HTTPS API; the API key never leaves the backend."""
    if not _email_api_is_configured():
        notification_logger.warning("Email API credentials are not configured.")
        return False

    api_key = settings.email_api_key.get_secret_value() if settings.email_api_key else ""
    sender = settings.email_from or ""
    if settings.email_from_name.strip():
        sender = f"{settings.email_from_name.strip()} <{sender}>"

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=10.0)) as client:
            response = await client.post(
                RESEND_EMAILS_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "User-Agent": "PowerManage/1.0",
                },
                json={
                    "from": sender,
                    "to": [receiver_email.strip()],
                    "subject": subject,
                    "html": html_body,
                },
            )
        if not response.is_success:
            raise EmailApiResponseError(response.status_code)
        logger.info("Email notification sent.")
        return True
    except Exception as error:
        _log_email_exception("email_notification_failed", error)
        return False


def email_notification_available(receiver_email: str | None) -> bool:
    if not receiver_email:
        return False
    if settings.email_transport == "resend" and not _email_api_is_configured():
        return False
    if settings.email_transport == "smtp" and _connection_config() is None:
        return False
    try:
        MessageSchema(subject="Invoice", recipients=[receiver_email], body="", subtype=MessageType.html)
        return True
    except Exception as error:
        _log_email_exception("email_recipient_validation_failed", error, category="smtp_recipient_rejected")
        return False


def _details_card(rows: list[tuple[str, str]]) -> str:
    return "".join(
        f'<tr><td style="padding:8px 0;color:#64748b">{html.escape(label)}</td>'
        f'<td style="padding:8px 0;text-align:right;font-weight:600">{html.escape(value)}</td></tr>'
        for label, value in rows
    )


def _email_layout(title: str, greeting: str, content: str) -> str:
    return f'''<!doctype html><html><body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,sans-serif;color:#0f172a">
<div style="max-width:600px;margin:auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0">
<div style="background:#0f766e;padding:24px;color:#fff"><h1 style="margin:0;font-size:24px">PowerManage</h1><p style="margin:8px 0 0">{html.escape(title)}</p></div>
<div style="padding:24px"><p>{html.escape(greeting)}</p>{content}</div>
</div></body></html>'''


async def send_invoice_email(data: InvoiceEmailData) -> EmailStatus:
    rows = _details_card([
        ("Invoice Number", _value(data.invoice_id)),
        ("Property / Room", _value(data.property_name)),
        ("Billing Period", _value(data.billing_period)),
        ("Previous Reading", _value(data.previous_reading)),
        ("Current Reading", _value(data.current_reading)),
        ("Units Consumed", _value(data.units)),
        ("Rate Per Unit", _money(data.rate) if data.rate is not None else "Configured tariff"),
        ("Due Date", _value(data.due_date)),
        ("Payment Status", "Pending"),
    ])
    content = f'<table style="width:100%;border-collapse:collapse">{rows}</table><p style="margin-top:24px;padding:16px;background:#ecfdf5;border-radius:10px;font-size:20px;font-weight:700">Total Amount: {_money(data.total_amount)}</p><p>Please open PowerManage → My Bills → View Invoice → Pay Now.</p><p>Regards,<br>PowerManage</p>'
    body = _email_layout("New Electricity Bill", f"Hello {data.user_name}, your electricity bill has been generated.", content)
    if not email_notification_available(data.user_email):
        logger.warning("No email address available for this user.")
        return EmailStatus.NOT_AVAILABLE
    return EmailStatus.SENT if await send_email(data.user_email, f"PowerManage - New Electricity Bill - {data.invoice_id}", body) else EmailStatus.FAILED


async def send_payment_success_email(data: PaymentEmailData) -> EmailStatus:
    is_demo = data.transaction_id.startswith("DEMO-PAY-")
    title = "Demo Payment Recorded" if is_demo else "Payment Recorded"
    notice = "No money was transferred. This is a simulated payment, not proof of real payment." if is_demo else "This payment was recorded by an administrator."
    content = f'<p>{notice}</p><table style="width:100%;border-collapse:collapse">{_details_card([("Invoice Number", data.invoice_id), ("Simulated Amount" if is_demo else "Amount Paid", _money(data.paid_amount)), ("Payment Method", data.payment_method), ("Transaction ID", data.transaction_id), ("Payment Date", data.paid_at), ("Status", "DEMO PAID" if is_demo else "PAID")])}</table><p>Thank you.<br>PowerManage</p>'
    body = _email_layout(title, f"Hello {data.user_name}, a payment entry was recorded for your electricity bill.", content)
    if not email_notification_available(data.user_email):
        logger.warning("No email address available for this user.")
        return EmailStatus.NOT_AVAILABLE
    return EmailStatus.SENT if await send_email(data.user_email, f"PowerManage - {title} - {data.invoice_id}", body) else EmailStatus.FAILED


async def send_payment_reminder_email(data: ReminderEmailData) -> EmailStatus:
    content = f'<table style="width:100%;border-collapse:collapse">{_details_card([("Invoice", data.invoice_id), ("Amount", _money(data.amount)), ("Due Date", data.due_date), ("Status", "Pending"), ("Reminder", data.reminder_type)])}</table><p>Please open PowerManage → My Bills to view and pay your invoice.</p>'
    body = _email_layout("Payment Reminder", f"Hello {data.user_name}, this is a reminder that your electricity bill is still pending.", content)
    if not email_notification_available(data.user_email):
        logger.warning("No email address available for this user.")
        return EmailStatus.NOT_AVAILABLE
    return EmailStatus.SENT if await send_email(data.user_email, f"PowerManage - Payment Reminder - {data.invoice_id}", body) else EmailStatus.FAILED
