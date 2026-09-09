"""Server-side PowerManage email notifications using FastAPI-Mail."""

from __future__ import annotations

import asyncio
import html
import logging
from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum
from typing import List, cast

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from pydantic import BaseModel, EmailStr, SecretStr

from app.core.config import settings

logger = logging.getLogger(__name__)

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
    except Exception:
        logger.warning("Email configuration is invalid.")
        return None


async def send_email(receiver_email: str | None, subject: str, html_body: str) -> bool:
    """Send HTML email through configured Gmail-compatible FastAPI-Mail SMTP."""
    if not receiver_email or not receiver_email.strip():
        logger.warning("No email address available for this user.")
        return False
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
    except Exception:
        # SMTP/validation exceptions may contain credentials or message contents.
        logger.warning("Email notification failed.")
        return False


def email_notification_available(receiver_email: str | None) -> bool:
    if not receiver_email or _connection_config() is None:
        return False
    try:
        MessageSchema(subject="Invoice", recipients=[receiver_email], body="", subtype=MessageType.html)
        return True
    except Exception:
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
