from uuid import uuid4
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import SecretStr
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.database.connection import SessionLocal
from app.models.bill import Bill
from app.services.email_service import EmailStatus
from tests.test_bills import create_linked_detailed_submitters, METADATA


def payload_for(property_id, submitter_id):
    return {
        "idempotency_key": str(uuid4()), "property_id": property_id,
        "calculation": {
            "main_meter": {"previous_reading": 0, "current_reading": 100, "rate_per_unit": 7},
            "submitters": [{"submitter_id": submitter_id, "name": "Forged", "previous_reading": 0, "current_reading": 50, "rate_per_unit": 7}],
        },
        "metadata": {k: v for k, v in METADATA.items() if k != "recipient_label"},
    }


@pytest.mark.parametrize("failure", [False, True])
def test_invoice_sender_is_awaited_and_exception_does_not_break_commit(
    client, bootstrap_admin, csrf_headers, create_managed_user, monkeypatch, caplog, failure,
):
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id, submitters = create_linked_detailed_submitters(client, headers, create_managed_user, 1)
    sender = AsyncMock(return_value=EmailStatus.SENT,
                       side_effect=RuntimeError("MAIL_PASSWORD=must-not-log") if failure else None)
    monkeypatch.setattr("app.routes.bills.send_invoice_email", sender)
    response = client.post("/api/bills/detailed", headers=headers, json=payload_for(property_id, submitters[0]))
    assert response.status_code == 201
    sender.assert_awaited_once()
    assert sender.await_args.args[0].user_email == "detailed-0@example.com"
    assert "must-not-log" not in caplog.text
    if failure:
        assert "invoice_email_failed" in caplog.text


@pytest.mark.parametrize("route", ["admin", "demo"])
@pytest.mark.parametrize("outcome", ["success", "false", "exception"])
def test_payment_notifies_assigned_user_after_commit(
    client, bootstrap_admin, csrf_headers, create_managed_user, monkeypatch, caplog, route, outcome,
):
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id, submitters = create_linked_detailed_submitters(client, headers, create_managed_user, 1)
    generated = client.post("/api/bills/detailed", headers=headers, json=payload_for(property_id, submitters[0]))
    assert generated.status_code == 201
    invoice = next(item for item in generated.json()["invoices"] if item["submitter_id"])

    async def sender(data):
        with SessionLocal() as database:
            assert database.get(Bill, invoice["id"]).status == "paid"
        if outcome == "exception":
            raise RuntimeError("MAIL_PASSWORD=must-not-log")
        return EmailStatus.SENT if outcome == "success" else False

    mocked = AsyncMock(side_effect=sender)
    module = "app.routes.bills" if route == "admin" else "app.routes.my_account"
    monkeypatch.setattr(f"{module}.send_payment_success_email", mocked)
    if route == "demo":
        assert client.post("/api/auth/login", json={"email": "detailed-0@example.com", "password": "TemporaryPassword1!"}).status_code == 200
        assert client.post("/api/auth/change-password", headers=csrf_headers(client), json={
            "current_password": "TemporaryPassword1!", "new_password": "PermanentPassword2!",
        }).status_code == 200
        response = client.post(f"/api/me/bills/{invoice['id']}/demo-payment", headers=csrf_headers(client), json={"payment_method": "upi"})
    else:
        response = client.post(f"/api/bills/{invoice['id']}/mark-paid", headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "paid"
    mocked.assert_awaited_once()
    assert mocked.await_args.args[0].user_email == "detailed-0@example.com"
    assert "must-not-log" not in caplog.text
    if outcome != "success":
        assert "payment_email_failed" in caplog.text


@pytest.mark.parametrize("mode", ["success", "missing", "smtp_failure", "commit_failure"])
def test_notification_commit_and_replay(client, bootstrap_admin, csrf_headers, create_managed_user, mock_smtp, monkeypatch, mode):
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id, submitters = create_linked_detailed_submitters(client, headers, create_managed_user, 1)
    payload = payload_for(property_id, submitters[0])
    if mode == "missing":
        monkeypatch.setattr(settings, "email_password", SecretStr(""))
    if mode == "smtp_failure":
        mock_smtp.side_effect = RuntimeError("SMTP failed")
    if mode == "commit_failure":
        with patch("sqlalchemy.orm.Session.commit", side_effect=IntegrityError("commit", {}, Exception())):
            response = client.post("/api/bills/detailed", headers=headers, json=payload)
        assert response.status_code == 409
        mock_smtp.assert_not_awaited()
        assert client.get("/api/bills").json()["total"] == 0
        return

    # A fresh session must see the invoice before SMTP starts.
    if mode == "success":
        async def check_committed(message):
            with SessionLocal() as db:
                assert db.query(Bill).filter(Bill.submitter_id == submitters[0]).count() == 1
        mock_smtp.side_effect = check_committed
    response = client.post("/api/bills/detailed", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    invoice = next(i for i in response.json()["invoices"] if i["submitter_id"])
    assert invoice["email_status"] == ("not_available" if mode == "missing" else "scheduled")
    if mode == "missing":
        mock_smtp.assert_not_awaited()
    else:
        mock_smtp.assert_awaited_once()
        message = mock_smtp.await_args.args[0]
        assert message.recipients[0].email == "detailed-0@example.com"
        assert invoice["bill_number"] in message.subject
        assert "350.00" in message.body
        assert invoice["due_date"] in message.body
        assert "Forged" not in message.body
    assert client.get(f"/api/bills/{invoice['id']}").status_code == 200
    count = mock_smtp.await_count
    replay = client.post("/api/bills/detailed", headers=headers, json=payload)
    assert replay.status_code == 201
    assert [i["id"] for i in replay.json()["invoices"]] == [i["id"] for i in response.json()["invoices"]]
    assert all(i["email_status"] is None for i in replay.json()["invoices"])
    assert mock_smtp.await_count == count


def test_unauthorized_and_invalid_requests_do_not_send(client, bootstrap_admin, csrf_headers, create_managed_user, mock_smtp):
    assert client.post("/api/bills/detailed", json={}).status_code == 401
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id, submitters = create_linked_detailed_submitters(client, headers, create_managed_user, 1)
    payload = payload_for(property_id, submitters[0])
    assert client.post("/api/bills/detailed", json=payload).status_code == 403
    payload["property_id"] = 999999
    assert client.post("/api/bills/detailed", headers=headers, json=payload).status_code == 404
    assert client.post("/api/bills/submitter", headers=headers, json={}).status_code == 422
    mock_smtp.assert_not_awaited()
