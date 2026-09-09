from decimal import Decimal

from app.database.connection import SessionLocal
from app.models.bill import Bill
from app.routes.my_account import _serialize_bill
from app.services.billing_service import serialize_bill
from app.services.invoice_display import invoice_display_fields
from tests.test_bills import create_linked_detailed_submitters
from tests.test_invoice_notifications import payload_for


def test_snapshot_display_handles_legacy_and_slab_data_without_inventing_rates():
    assert invoice_display_fields(None)["rate_per_unit"] is None
    fields = invoice_display_fields({"previous_reading": "00500.000000", "current_reading": "686.000000", "rate_mode": "slab", "breakdown": []})
    assert fields["previous_reading"] == Decimal("500")
    assert fields["rate_mode"] == "slab"
    assert fields["rate_per_unit"] is None
    assert invoice_display_fields({"rate_per_unit": "Infinity"})["rate_per_unit"] is None


def test_admin_and_user_documents_share_persisted_snapshot(client, bootstrap_admin, csrf_headers, create_managed_user, mock_smtp):
    bootstrap_admin(client)
    headers = csrf_headers(client)
    property_id, submitters = create_linked_detailed_submitters(client, headers, create_managed_user, 1)
    response = client.post("/api/bills/detailed", headers=headers, json=payload_for(property_id, submitters[0]))
    assert response.status_code == 201
    invoice = next(item for item in response.json()["invoices"] if item["submitter_id"])
    with SessionLocal() as db:
        stored = db.get(Bill, invoice["id"])
        before = dict(stored.result_snapshot)
        admin = serialize_bill(stored).model_dump(mode="json")
        user = _serialize_bill(stored).model_dump(mode="json")
        for key in ("previous_reading", "current_reading", "rate_per_unit", "rate_mode", "breakdown", "total_amount", "transaction_id", "paid_at"):
            assert admin[key] == user[key]
        assert admin["rate_per_unit"] == 7
        assert admin["previous_reading"] == 0
        assert stored.result_snapshot == before
