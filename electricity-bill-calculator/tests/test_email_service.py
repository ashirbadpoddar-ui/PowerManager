import asyncio
import smtplib
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi_mail import MessageType

from pydantic import SecretStr

from app.core.config import settings
from app.services.email_service import (
    EmailStatus,
    InvoiceEmailData,
    PaymentEmailData,
    ReminderEmailData,
    send_email,
    send_invoice_email,
    send_payment_reminder_email,
    send_payment_success_email,
)


def configure_email(monkeypatch):
    monkeypatch.setattr(settings, "email_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "email_port", 587)
    monkeypatch.setattr(settings, "email_username", "admin@example.com")
    monkeypatch.setattr(settings, "email_password", SecretStr("test-app-password"))
    monkeypatch.setattr(settings, "email_from", "admin@example.com")
    monkeypatch.setattr(settings, "email_from_name", "PowerManage")
    monkeypatch.setattr(settings, "mail_starttls", True)
    monkeypatch.setattr(settings, "mail_ssl_tls", False)


def test_send_email_uses_fastapi_mail_and_never_exposes_password(monkeypatch):
    configure_email(monkeypatch)
    fast_mail = MagicMock()
    fast_mail.send_message = AsyncMock()
    with patch("app.services.email_service.FastMail", return_value=fast_mail) as fast_mail_factory:
        assert asyncio.run(send_email("rahul@example.com", "PowerManage Email Test", "<p>SMTP is working</p>")) is True

    config = fast_mail_factory.call_args.args[0]
    assert config.MAIL_SERVER == "smtp.gmail.com"
    assert config.MAIL_PORT == 587
    assert config.MAIL_STARTTLS is True
    assert config.MAIL_SSL_TLS is False
    assert config.VALIDATE_CERTS is True
    assert config.TIMEOUT == 10
    message = fast_mail.send_message.call_args.args[0]
    assert message.recipients[0].email == "rahul@example.com"
    assert message.subtype is MessageType.html
    assert "<p>SMTP is working</p>" in message.body
    assert "test-app-password" not in str(message)


def test_missing_credentials_and_recipient_do_not_attempt_fastapi_mail(monkeypatch, caplog):
    monkeypatch.setattr(settings, "email_host", "smtp.gmail.com")
    monkeypatch.setattr(settings, "email_username", "admin@example.com")
    monkeypatch.setattr(settings, "email_password", SecretStr(""))
    monkeypatch.setattr(settings, "email_from", "admin@example.com")
    with patch("app.services.email_service.FastMail") as fast_mail_factory:
        assert asyncio.run(send_email("rahul@example.com", "Subject", "<p>Body</p>")) is False
        assert asyncio.run(send_email("", "Subject", "<p>Body</p>")) is False
    fast_mail_factory.assert_not_called()
    assert "Email credentials are not configured." in caplog.text
    assert "No email address available for this user." in caplog.text


def test_fastapi_mail_failure_returns_false_and_logs_without_raising(monkeypatch, caplog):
    configure_email(monkeypatch)
    fast_mail = MagicMock()
    fast_mail.send_message = AsyncMock(side_effect=RuntimeError("SMTP unavailable"))
    with patch("app.services.email_service.FastMail", return_value=fast_mail):
        assert asyncio.run(send_email("rahul@example.com", "Subject", "<p>Body</p>")) is False
    assert "email_notification_failed" in caplog.text
    assert "smtp_send_failed" in caplog.text
    assert "RuntimeError" in caplog.text


def test_invoice_email_formats_values_cleanly(monkeypatch):
    configure_email(monkeypatch)
    fast_mail = MagicMock()
    fast_mail.send_message = AsyncMock()
    with patch("app.services.email_service.FastMail", return_value=fast_mail):
        result = asyncio.run(send_invoice_email(InvoiceEmailData(
            user_name="Rahul Sharma",
            user_email="rahul@example.com",
            invoice_id="INV-2026-0001",
            property_name="Room 101",
            billing_period="01 Sep 2026 to 30 Sep 2026",
            previous_reading="001000.000000",
            current_reading="001200.000000",
            units="00200.000000",
            rate="7",
            total_amount="1400",
            due_date="2026-10-10",
        )))

    assert result is EmailStatus.SENT
    body = fast_mail.send_message.call_args.args[0].body
    assert "Previous Reading" in body and "1000" in body
    assert "Current Reading" in body and "1200" in body
    assert "00200.000000" not in body
    assert "200" in body
    assert "7.00" in body
    assert "1,400.00" in body
    assert "GST" not in body
    assert "Extra Charges" not in body


def test_payment_and_reminder_emails_include_required_fields(monkeypatch):
    configure_email(monkeypatch)
    fast_mail = MagicMock()
    fast_mail.send_message = AsyncMock()
    with patch("app.services.email_service.FastMail", return_value=fast_mail):
        payment_result = asyncio.run(send_payment_success_email(PaymentEmailData(
            user_name="Rahul Sharma", user_email="rahul@example.com", invoice_id="INV-2026-0001",
            paid_amount="1400", payment_method="UPI", transaction_id="DEMO-PAY-2026-0001",
            paid_at="10 Sep 2026, 10:30",
        )))
        reminder_result = asyncio.run(send_payment_reminder_email(ReminderEmailData(
            user_name="Rahul Sharma", user_email="rahul@example.com", invoice_id="INV-2026-0001",
            amount="1400", due_date="10 Sep 2026", reminder_type="Overdue",
        )))

    assert payment_result is EmailStatus.SENT
    assert reminder_result is EmailStatus.SENT
    messages = [call.args[0].body for call in fast_mail.send_message.call_args_list]
    assert "DEMO-PAY-2026-0001" in messages[0]
    assert "PAID" in messages[0]
    assert "1,400.00" in messages[1]


def test_timeout_and_sensitive_exception_are_safe(monkeypatch, caplog):
    configure_email(monkeypatch)
    with patch("app.services.email_service.FastMail.send_message", new=AsyncMock(side_effect=TimeoutError("secret-password recipient@example.com"))):
        assert asyncio.run(send_email("rahul@example.com", "Subject", "Body")) is False
    assert "secret-password" not in caplog.text
    assert "recipient@example.com" not in caplog.text
    assert "smtp_timeout" in caplog.text
    assert "TimeoutError" in caplog.text


def test_smtp_failure_categories_are_logged_without_sensitive_details(monkeypatch, caplog):
    configure_email(monkeypatch)
    failure = smtplib.SMTPAuthenticationError(535, b"MAIL_PASSWORD=secret-password")
    with patch("app.services.email_service.FastMail.send_message", new=AsyncMock(side_effect=failure)):
        assert asyncio.run(send_email("rahul@example.com", "Subject", "Body")) is False

    assert "smtp_authentication_failed" in caplog.text
    assert "SMTPAuthenticationError" in caplog.text
    assert "MAIL_PASSWORD=<redacted>" in caplog.text
    assert "secret-password" not in caplog.text


def test_invalid_config_and_recipient_are_unavailable(monkeypatch, caplog):
    from app.services.email_service import email_notification_available
    configure_email(monkeypatch)
    assert not email_notification_available("invalid-address")
    monkeypatch.setattr(settings, "email_from", "invalid-secret-value")
    assert not email_notification_available("rahul@example.com")
    assert "invalid-secret-value" not in caplog.text


def test_stalled_smtp_is_cancelled_at_overall_deadline(monkeypatch):
    configure_email(monkeypatch)
    real_wait_for = asyncio.wait_for
    cancelled = []

    async def stalled(*args, **kwargs):
        try:
            await asyncio.sleep(60)
        finally:
            cancelled.append(True)

    async def short_deadline(awaitable, timeout):
        assert timeout == 15
        return await real_wait_for(awaitable, timeout=0.01)

    with patch("app.services.email_service.FastMail.send_message", new=stalled), patch("app.services.email_service.asyncio.wait_for", new=short_deadline):
        assert asyncio.run(send_email("rahul@example.com", "Subject", "Body")) is False
    assert cancelled == [True]
