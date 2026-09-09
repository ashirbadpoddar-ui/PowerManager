from collections.abc import Callable
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient

from app.services.email_service import EmailStatus


METADATA = {
    "recipient_label": "Apartment A",
    "property_label": "Sunshine Apartments",
    "unit_label": "A-101",
    "period_start": "2099-01-01",
    "period_end": "2099-01-31",
    "due_date": "2099-02-15",
}


def create_linked_detailed_submitters(client: TestClient, headers: dict[str, str], create_managed_user: Callable, count: int) -> tuple[int, list[int]]:
    property_response = client.post("/api/properties", headers=headers, json={"name": "Detailed Property", "place": "Pune", "unit": "D-1"})
    assert property_response.status_code == 201
    property_id = property_response.json()["id"]
    submitter_ids = []
    for index in range(count):
        account = create_managed_user(client, name=f"Detailed User {index}", email=f"detailed-{index}@example.com")
        created = client.post(f"/api/properties/{property_id}/submitters", headers=headers, json={"name": f"Detailed User {index}"})
        assert created.status_code == 201
        submitter_id = created.json()["id"]
        assert client.patch(f"/api/properties/{property_id}/submitters/{submitter_id}/account", headers=headers, json={"user_id": account["id"]}).status_code == 200
        submitter_ids.append(submitter_id)
    return property_id, submitter_ids


def test_simple_preview_is_not_saved_and_generation_uses_active_tariff(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)

    preview = client.post(
        "/api/electricity/calculate",
        headers=csrf_headers(client),
        json={
            "units": 250.5,
            "fixed_charge": 100,
            "tax_rate": 5,
            "slabs": [
                {"min_units": 0, "max_units": None, "rate_per_unit": 1},
            ],
        },
    )
    assert preview.status_code == 200
    # The calculator intentionally applies the configured tariff only. Fixed
    # charges and tax inputs are retained for compatibility but are not added.
    assert preview.json()["total_amount"] == 250.5
    assert client.get("/api/bills").json() == {"items": [], "total": 0}

    generated = client.post(
        "/api/bills/simple",
        headers=csrf_headers(client),
        json={
            "calculation": {
                "units": 250.5,
                "fixed_charge": 100,
                "tax_rate": 5,
            },
            "metadata": METADATA,
        },
    )
    assert generated.status_code == 201, generated.text
    body = generated.json()
    assert body["calculation_type"] == "simple"
    assert body["tariff_id"] is not None
    assert body["total_units"] == 250.5
    assert body["energy_amount"] == 1755.0
    assert body["total_amount"] == 1755.0
    assert body["status"] == "pending"

    listed = client.get("/api/bills")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["id"] == body["id"]


def test_bill_lifecycle_is_manual_and_terminal(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    generated = client.post(
        "/api/bills/simple",
        headers=csrf_headers(client),
        json={
            "calculation": {"units": 50.25, "fixed_charge": 10, "tax_rate": 5},
            "metadata": METADATA,
        },
    )
    assert generated.status_code == 201
    bill_id = generated.json()["id"]

    assert client.post(f"/api/bills/{bill_id}/mark-paid").status_code == 403
    paid = client.post(
        f"/api/bills/{bill_id}/mark-paid",
        headers=csrf_headers(client),
    )
    assert paid.status_code == 200
    assert paid.json()["status"] == "paid"
    assert paid.json()["paid_at"] is not None

    repeated = client.post(
        f"/api/bills/{bill_id}/mark-paid",
        headers=csrf_headers(client),
    )
    assert repeated.status_code == 409
    cannot_void_paid = client.post(
        f"/api/bills/{bill_id}/void",
        headers=csrf_headers(client),
    )
    assert cannot_void_paid.status_code == 409


def test_detailed_generation_creates_main_and_submitter_invoices(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
    create_managed_user: Callable,
) -> None:
    bootstrap_admin(client)
    property_id, submitter_ids = create_linked_detailed_submitters(client, csrf_headers(client), create_managed_user, 2)
    response = client.post(
        "/api/bills/detailed",
        headers=csrf_headers(client),
        json={
            "property_id": property_id,
            "calculation": {
                "main_meter": {
                    "previous_reading": 100,
                    "current_reading": 250.5,
                    "rate_per_unit": 10,
                },
                "submitters": [
                    {
                        "submitter_id": submitter_ids[0], "name": "forged name",
                        "previous_reading": 10,
                        "current_reading": 50.25,
                        "rate_per_unit": 11,
                    },
                    {
                        "submitter_id": submitter_ids[1], "name": "forged name",
                        "previous_reading": 20,
                        "current_reading": 80.5,
                        "rate_per_unit": 12,
                    },
                ],
            },
            "metadata": {
                "property_label": "Sunshine Apartments",
                "unit_label": "Main meter",
                "period_start": "2099-01-01",
                "period_end": "2099-01-31",
                "due_date": "2099-02-15",
            },
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["billing_run"]["difference_units"] == 49.75
    assert body["billing_run"]["total_amount"] == 2673.75
    assert len(body["invoices"]) == 3
    assert [invoice["calculation_type"] for invoice in body["invoices"]] == [
        "main_meter",
        "submitter",
        "submitter",
    ]
    assert all(invoice["tax_amount"] == 0 for invoice in body["invoices"])
    assert round(sum(invoice["total_amount"] for invoice in body["invoices"]), 2) == 2673.75


def test_detailed_generation_allows_submitters_above_main_usage(
    client: TestClient,
    bootstrap_admin: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
    create_managed_user: Callable,
) -> None:
    bootstrap_admin(client)
    property_id, submitter_ids = create_linked_detailed_submitters(client, csrf_headers(client), create_managed_user, 1)
    response = client.post(
        "/api/bills/detailed",
        headers=csrf_headers(client),
        json={
            "property_id": property_id,
            "calculation": {
                "main_meter": {
                    "previous_reading": 0,
                    "current_reading": 10,
                    "rate_per_unit": 5,
                },
                "submitters": [
                    {"submitter_id": submitter_ids[0], "name": "forged name", "previous_reading": 0, "current_reading": 11, "rate_per_unit": 3},
                ],
            },
            "metadata": {
                "period_start": "2099-01-01",
                "period_end": "2099-01-31",
                "due_date": "2099-02-15",
            },
        },
    )
    assert response.status_code == 201, response.text
    assert len(response.json()["invoices"]) == 2


def test_submitter_users_are_scoped_to_linked_data_and_cannot_use_admin_billing(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    account = create_managed_user(client)
    headers = csrf_headers(client)
    property_response = client.post(
        "/api/properties",
        headers=headers,
        json={"name": "Sunshine Apartments", "place": "Pune", "unit": "A-101"},
    )
    assert property_response.status_code == 201
    property_id = property_response.json()["id"]
    submitter_response = client.post(
        f"/api/properties/{property_id}/submitters",
        headers=headers,
        json={"name": "Regular User"},
    )
    assert submitter_response.status_code == 201
    submitter_id = submitter_response.json()["id"]
    assignment = client.patch(
        f"/api/properties/{property_id}/submitters/{submitter_id}/account",
        headers=headers,
        json={"user_id": account["id"]},
    )
    assert assignment.status_code == 200

    generated = client.post(
        "/api/bills/detailed",
        headers=csrf_headers(client),
        json={
            "property_id": property_id,
            "calculation": {
                "main_meter": {"previous_reading": 0, "current_reading": 30, "rate_per_unit": 5},
                "submitters": [{"submitter_id": submitter_id, "name": "Regular User", "previous_reading": 0, "current_reading": 20, "rate_per_unit": 5}],
            },
            "metadata": {
                "property_label": "Sunshine Apartments",
                "unit_label": "A-101",
                "period_start": "2099-01-01",
                "period_end": "2099-01-31",
                "due_date": "2099-02-15",
            },
        },
    )
    assert generated.status_code == 201, generated.text
    submitter_bill = next(item for item in generated.json()["invoices"] if item["calculation_type"] == "submitter")

    with TestClient(client.app, base_url="http://testserver") as user_client:
        assert user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        ).status_code == 200
        assert user_client.post(
            "/api/auth/change-password",
            headers=csrf_headers(user_client),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        ).status_code == 200

        # Generic admin billing endpoints cannot be used to inspect or create
        # invoices from a normal account.
        assert user_client.get("/api/bills").status_code == 403
        assert user_client.get(f"/api/bills/{submitter_bill['id']}").status_code == 403
        assert user_client.post(
            "/api/bills/simple",
            headers=csrf_headers(user_client),
            json={"calculation": {"units": 20}, "metadata": METADATA},
        ).status_code == 403

        context = user_client.get("/api/me/submitter")
        assert context.status_code == 200
        assert context.json()["submitter_id"] == submitter_id
        bills = user_client.get("/api/me/bills")
        assert bills.status_code == 200
        assert bills.json()["total"] == 1
        assert bills.json()["items"][0]["id"] == submitter_bill["id"]
        assert "tax_amount" not in bills.json()["items"][0]

        reading = user_client.post(
            "/api/me/meter-readings",
            headers=csrf_headers(user_client),
            json={"current_reading": 20, "reading_date": "2099-01-31"},
        )
        assert reading.status_code == 201
        invalid = user_client.post(
            "/api/me/meter-readings",
            headers=csrf_headers(user_client),
            json={"current_reading": 19, "reading_date": "2099-02-01"},
        )
        assert invalid.status_code == 422

    assert client.get("/api/bills").json()["total"] == 2


def test_unassigned_submitter_user_receives_empty_context(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
) -> None:
    bootstrap_admin(client)
    create_managed_user(client)

    with TestClient(client.app, base_url="http://testserver") as user_client:
        login = user_client.post(
            "/api/auth/login",
            json={"email": "user@example.com", "password": "TemporaryPassword1!"},
        )
        assert login.status_code == 200
        changed = user_client.post(
            "/api/auth/change-password",
            headers=csrf_headers(user_client),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        )
        assert changed.status_code == 200

        context = user_client.get("/api/me/submitter")
        assert context.status_code == 200
        assert context.json() == {"assigned": False, "tariff": []}


def test_property_submitter_invoice_is_shared_with_assigned_user_and_rejects_duplicates(
    client: TestClient,
    bootstrap_admin: Callable,
    create_managed_user: Callable,
    csrf_headers: Callable[[TestClient], dict[str, str]],
    monkeypatch,
) -> None:
    send_invoice = AsyncMock(return_value=EmailStatus.SENT)
    monkeypatch.setattr("app.routes.bills.send_invoice_email", send_invoice)
    bootstrap_admin(client)
    account = create_managed_user(client, name="Rahul Sharma", email="rahul@example.com")
    headers = csrf_headers(client)
    property_response = client.post(
        "/api/properties",
        headers=headers,
        json={"name": "Room 101", "place": "Building A", "unit": "101"},
    )
    assert property_response.status_code == 201
    property_id = property_response.json()["id"]
    submitter_response = client.post(
        f"/api/properties/{property_id}/submitters",
        headers=headers,
        json={"name": "Rahul Sharma"},
    )
    assert submitter_response.status_code == 201
    submitter_id = submitter_response.json()["id"]
    assignment = client.patch(
        f"/api/properties/{property_id}/submitters/{submitter_id}/account",
        headers=headers,
        json={"user_id": account["id"]},
    )
    assert assignment.status_code == 200

    payload = {
        "submitter_id": submitter_id,
        "previous_reading": 1000,
        "current_reading": 1200,
        "rate_mode": "manual",
        "rate_per_unit": 7,
        "metadata": {
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "due_date": "2026-10-10",
        },
    }
    generated = client.post("/api/bills/submitter", headers=headers, json=payload)
    assert generated.status_code == 201, generated.text
    invoice = generated.json()
    assert invoice["submitter_id"] == submitter_id
    assert invoice["recipient_label"] == "Rahul Sharma"
    assert invoice["property_label"] == "Room 101"
    assert invoice["total_units"] == 200
    assert invoice["total_amount"] == 1400
    send_invoice.assert_awaited_once()
    email_data = send_invoice.await_args.args[0]
    assert email_data.user_name == "Rahul Sharma"
    assert email_data.user_email == "rahul@example.com"
    assert email_data.invoice_id == invoice["bill_number"]
    assert email_data.units == 200
    assert email_data.total_amount == 1400
    assert email_data.due_date == "2026-10-10"
    assert invoice["email_status"] == "scheduled"

    duplicate = client.post("/api/bills/submitter", headers=headers, json=payload)
    assert duplicate.status_code == 409
    send_invoice.assert_awaited_once()
    assert duplicate.json()["detail"] == "An invoice already exists for this user and billing period."

    with TestClient(client.app, base_url="http://testserver") as user_client:
        login = user_client.post(
            "/api/auth/login",
            json={"email": "rahul@example.com", "password": "TemporaryPassword1!"},
        )
        assert login.status_code == 200
        changed = user_client.post(
            "/api/auth/change-password",
            headers=csrf_headers(user_client),
            json={
                "current_password": "TemporaryPassword1!",
                "new_password": "PermanentPassword2!",
            },
        )
        assert changed.status_code == 200

        bills = user_client.get("/api/me/bills")
        assert bills.status_code == 200
        assert bills.json()["total"] == 1
        assert bills.json()["items"][0]["id"] == invoice["id"]
        assert bills.json()["items"][0]["total_amount"] == 1400

        # Payment state, amount, timestamp, and transaction ID are all
        # server-owned. Client attempts to override them are rejected.
        tampered_payment = user_client.post(
            f"/api/me/bills/{invoice['id']}/demo-payment",
            headers=csrf_headers(user_client),
            json={
                "payment_method": "upi",
                "paymentStatus": "paid",
                "paid_amount": 1,
                "transaction_id": "client-controlled",
            },
        )
        assert tampered_payment.status_code == 422

        paid = user_client.post(
            f"/api/me/bills/{invoice['id']}/demo-payment",
            headers=csrf_headers(user_client),
            json={"payment_method": "upi"},
        )
        assert paid.status_code == 200, paid.text
        assert paid.json()["status"] == "paid"
        assert paid.json()["total_amount"] == 1400
        assert paid.json()["payment_method"] == "upi"
        assert paid.json()["transaction_id"].startswith("DEMO-PAY-")
        assert paid.json()["paid_at"] is not None

    # The administrator sees the same persisted invoice transition.
    admin_view = client.get(f"/api/bills/{invoice['id']}")
    assert admin_view.status_code == 200
    assert admin_view.json()["status"] == "paid"


def test_bill_endpoints_require_authentication(client: TestClient) -> None:
    assert client.get("/api/bills").status_code == 401
    assert client.post(
        "/api/bills/simple",
        json={
            "calculation": {"units": 1},
            "metadata": METADATA,
        },
    ).status_code == 401
