"""Security regressions: real HTTP dependencies and dedicated PostgreSQL data."""
import asyncio
from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.services.email_service import PaymentEmailData, send_payment_success_email
from app.models.user import User
from app.services.billing_service import mark_bill_paid, void_bill, update_bill_due_date
from datetime import date


META = {"period_start": "2099-01-01", "period_end": "2099-01-31", "due_date": "2099-02-15"}


def login(client, email, csrf_headers):
    assert client.post("/api/auth/login", json={"email": email, "password": "TemporaryPassword1!"}).status_code == 200
    assert client.post("/api/auth/change-password", headers=csrf_headers(client), json={
        "current_password": "TemporaryPassword1!", "new_password": "PermanentPassword2!",
    }).status_code == 200


def assigned_bill(admin, account, csrf_headers):
    headers = csrf_headers(admin)
    prop = admin.post("/api/properties", headers=headers, json={"name": "Test room", "place": "Test", "unit": "1"})
    assert prop.status_code == 201
    pid = prop.json()["id"]
    sub = admin.post(f"/api/properties/{pid}/submitters", headers=headers, json={"name": "Recipient"})
    assert sub.status_code == 201
    sid = sub.json()["id"]
    assert admin.patch(f"/api/properties/{pid}/submitters/{sid}/account", headers=headers, json={"user_id": account["id"]}).status_code == 200
    bill = admin.post("/api/bills/submitter", headers=headers, json={
        "submitter_id": sid, "previous_reading": 0, "current_reading": 20,
        "rate_mode": "manual", "rate_per_unit": 5, "metadata": META,
    })
    assert bill.status_code == 201
    return bill.json()["id"], pid


@pytest.fixture(autouse=True)
def no_external_email(monkeypatch):
    from app.services.email_service import EmailStatus
    monkeypatch.setattr("app.routes.bills.send_invoice_email", AsyncMock(return_value=EmailStatus.SENT))
    monkeypatch.setattr("app.routes.my_account.send_payment_success_email", AsyncMock())


def test_demoted_creator_cannot_demo_pay_another_recipient(client, bootstrap_admin, create_managed_user, csrf_headers):
    _, creator = bootstrap_admin(client)
    recipient = create_managed_user(client)
    create_managed_user(client, email="second-admin@example.com", role="administrator")
    bill_id, _ = assigned_bill(client, recipient, csrf_headers)
    with TestClient(app) as second:
        login(second, "second-admin@example.com", csrf_headers)
        assert second.patch(f"/api/users/{creator['id']}", headers=csrf_headers(second), json={"role": "user"}).status_code == 200
        assert client.get(f"/api/me/bills/{bill_id}").status_code == 404
        response = client.post(f"/api/me/bills/{bill_id}/demo-payment", headers=csrf_headers(client), json={"payment_method": "upi"})
        assert response.status_code == 404
        assert second.get(f"/api/bills/{bill_id}").json()["status"] == "pending"


def test_payment_permissions_and_terminal_states(client, bootstrap_admin, create_managed_user, csrf_headers):
    bootstrap_admin(client)
    owner = create_managed_user(client)
    create_managed_user(client, email="other@example.com")
    bill_id, pid = assigned_bill(client, owner, csrf_headers)
    reading = client.post("/api/meter-readings", headers=csrf_headers(client), json={
        "property_id": pid, "meter_name": "Main Meter", "previous_reading": 0,
        "current_reading": 20, "reading_date": "2099-01-31",
    })
    assert reading.status_code == 201
    with TestClient(app) as anonymous:
        for path in [f"/api/bills/{bill_id}/mark-paid", f"/api/bills/{bill_id}/void", f"/api/me/bills/{bill_id}/demo-payment"]:
            assert anonymous.post(path, json={"payment_method": "upi"}).status_code == 401
    with TestClient(app) as other:
        login(other, "other@example.com", csrf_headers)
        assert other.get(f"/api/me/bills/{bill_id}").status_code == 404
        assert other.post(f"/api/me/bills/{bill_id}/demo-payment", headers=csrf_headers(other), json={"payment_method": "upi"}).status_code == 404
        assert other.patch(f"/api/properties/{pid}", headers=csrf_headers(other), json={"name": "Forged"}).status_code == 403
        assert other.patch(f"/api/users/{owner['id']}", headers=csrf_headers(other), json={"role": "administrator"}).status_code == 403
        assert other.get("/api/meter-readings").json()["items"] == []
        assert other.patch(f"/api/meter-readings/{reading.json()['id']}", headers=csrf_headers(other), json={"current_reading": 30}).status_code == 403
        assert other.post("/api/me/meter-readings", headers=csrf_headers(other), json={"current_reading": 30, "property_id": pid}).status_code in {404, 422}
    with TestClient(app) as user:
        login(user, "user@example.com", csrf_headers)
        assert user.get(f"/api/me/bills/{bill_id}").status_code == 200
        for action in ["mark-paid", "void"]:
            assert user.post(f"/api/bills/{bill_id}/{action}", headers=csrf_headers(user)).status_code == 403
        path = f"/api/me/bills/{bill_id}/demo-payment"
        assert user.post(path, json={"payment_method": "upi"}).status_code == 403
        for extra in [{"total_amount": 1}, {"status": "paid"}, {"paid_at": "2099-01-01"}, {"user_id": owner["id"]}]:
            assert user.post(path, headers=csrf_headers(user), json={"payment_method": "upi", **extra}).status_code == 422
        paid = user.post(path, headers=csrf_headers(user), json={"payment_method": "upi"})
        assert paid.status_code == 200
        assert paid.json()["total_amount"] == 100
        assert paid.json()["transaction_id"].startswith("DEMO-PAY-")
        assert user.post(path, headers=csrf_headers(user), json={"payment_method": "card"}).status_code == 409
        assert client.post(f"/api/bills/{bill_id}/void", headers=csrf_headers(client)).status_code == 409
        # Cancellation is also terminal through the recipient's demo route.
        sid = client.get(f"/api/bills/{bill_id}").json()["submitter_id"]
        next_bill = client.post("/api/bills/submitter", headers=csrf_headers(client), json={
            "submitter_id": sid, "previous_reading": 20, "current_reading": 30,
            "rate_mode": "manual", "rate_per_unit": 5,
            "metadata": {"period_start": "2099-02-01", "period_end": "2099-02-28", "due_date": "2099-03-15"},
        })
        assert next_bill.status_code == 201
        cancelled_id = next_bill.json()["id"]
        assert client.post(f"/api/bills/{cancelled_id}/void", headers=csrf_headers(client)).status_code == 200
        assert user.post(f"/api/me/bills/{cancelled_id}/demo-payment", headers=csrf_headers(user), json={"payment_method": "upi"}).status_code == 409
    # An administrator can cancel an issued invoice, but cannot repeat or pay it.
    generated = client.post("/api/bills/simple", headers=csrf_headers(client), json={"calculation": {"units": 1}, "metadata": {**META, "recipient_label": "Test"}})
    assert generated.status_code == 201
    void_id = generated.json()["id"]
    assert client.post(f"/api/bills/{void_id}/void", headers=csrf_headers(client)).status_code == 200
    for action in ["void", "mark-paid"]:
        assert client.post(f"/api/bills/{void_id}/{action}", headers=csrf_headers(client)).status_code == 409


def test_demo_email_explicitly_disclaims_real_payment(monkeypatch):
    sender = AsyncMock(return_value=True)
    monkeypatch.setattr("app.services.email_service.send_email", sender)
    asyncio.run(send_payment_success_email(PaymentEmailData(
        user_name="Test", user_email="test@example.com", invoice_id="TEST-1", paid_amount=100,
        payment_method="upi", transaction_id="DEMO-PAY-TEST", paid_at="2099-01-01",
    )))
    _, subject, body = sender.await_args.args
    assert "Demo" in subject
    assert "No money was transferred" in body


@pytest.mark.parametrize("action", [mark_bill_paid, void_bill, update_bill_due_date])
def test_privileged_services_reject_regular_user_before_database_access(action):
    database = Mock()
    user = User(id=123, role="user")
    args = (date(2099, 2, 15),) if action is update_bill_due_date else ()
    with pytest.raises(HTTPException) as error:
        action(database, user, 123, *args)
    assert error.value.status_code == 403
    assert database.mock_calls == []
