from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.bill import SimpleBillGenerateRequest
from app.schemas.meter_reading import MeterReadingCreate
from app.schemas.portal import DemoPaymentRequest
from app.services.bill_calculator import calculate_bill
from app.schemas.electricity import BillCalculationRequest


def test_payment_request_rejects_client_owned_state_fields() -> None:
    with pytest.raises(ValidationError):
        DemoPaymentRequest(
            payment_method="upi",
            paymentStatus="paid",
            paid_amount=1,
            transaction_id="client-controlled",
        )


def test_bill_generation_request_rejects_tampered_total() -> None:
    with pytest.raises(ValidationError):
        SimpleBillGenerateRequest(
            calculation={"units": 100, "total_amount": 1},
            metadata={
                "recipient_label": "Unit A",
                "period_start": "2026-09-01",
                "period_end": "2026-09-30",
                "due_date": "2026-10-01",
            },
        )


@pytest.mark.parametrize("value", ["NaN", "Infinity", "-Infinity"])
def test_meter_reading_rejects_non_finite_values(value: str) -> None:
    with pytest.raises(ValidationError):
        MeterReadingCreate(
            property_id=1,
            meter_name="Main Meter",
            previous_reading=value,
            current_reading=Decimal("1"),
            reading_date="2026-09-01",
        )


def test_server_calculation_has_no_client_total_override() -> None:
    result = calculate_bill(
        BillCalculationRequest(
            units=Decimal("100"),
            slabs=[{"min_units": 0, "max_units": None, "rate_per_unit": 14}],
        )
    )
    assert result.total_amount == Decimal("1400.00")
