from decimal import Decimal

from app.schemas.electricity import BillCalculationRequest, DetailedBillRequest
from app.services.bill_calculator import calculate_bill, calculate_detailed_bill


def test_fractional_simple_bill_uses_contiguous_half_open_slabs() -> None:
    request = BillCalculationRequest.model_validate({
        "units": "250.5", "fixed_charge": "100", "tax_rate": "5",
        "slabs": [
            {"min_units": "0", "max_units": "100", "rate_per_unit": "5"},
            {"min_units": "100", "max_units": "200", "rate_per_unit": "7.5"},
            {"min_units": "200", "max_units": None, "rate_per_unit": "10"},
        ],
    })
    result = calculate_bill(request)
    assert result.subtotal == Decimal("1755.00")
    assert result.tax_amount == Decimal("0")
    assert result.total_amount == Decimal("1755.00")


def test_detailed_billing_calculates_main_and_submitters_independently() -> None:
    request = DetailedBillRequest.model_validate({
        "main_meter": {"previous_reading": "100", "current_reading": "250", "rate_per_unit": "10"},
        "submitters": [
            {"name": "Unit A", "previous_reading": "0", "current_reading": "40", "rate_per_unit": "12"},
            {"name": "Unit B", "previous_reading": "20", "current_reading": "180", "rate_per_unit": "8"},
        ],
    })
    result = calculate_detailed_bill(request)
    assert result.main_meter.units == Decimal("150")
    assert result.main_meter.total_amount == Decimal("1500.00")
    assert [item.total_amount for item in result.submitters] == [Decimal("480.00"), Decimal("1280.00")]
    assert result.submitter_total_units == Decimal("200")
    assert result.submitter_total_amount == Decimal("1760.00")


def test_detailed_billing_allows_empty_and_overlapping_usage_without_charges() -> None:
    result = calculate_detailed_bill(DetailedBillRequest.model_validate({
        "main_meter": {"previous_reading": "0", "current_reading": "10", "rate_per_unit": "5"},
        "submitters": [{"name": "Unit A", "previous_reading": "0", "current_reading": "20", "rate_per_unit": "3"}],
    }))
    assert result.main_meter.total_amount == Decimal("50.00")
    assert result.submitters[0].total_amount == Decimal("60.00")
    empty = calculate_detailed_bill(DetailedBillRequest.model_validate({
        "main_meter": {"previous_reading": "10", "current_reading": "10", "rate_per_unit": "5"},
        "submitters": [],
    }))
    assert empty.submitters == []
    assert empty.submitter_total_amount == 0
