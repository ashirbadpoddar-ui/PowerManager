"""Schemas for the restricted submitter self-service API.

These models intentionally omit the legacy charge and tax columns retained on
the billing tables for historic invoice compatibility.
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

# Use the same slab model returned by the tariff settings service.  The
# calculation schemas contain a structurally similar model, but Pydantic does
# not treat instances of the two classes as interchangeable.
from app.schemas.settings import ElectricitySlab
from app.schemas.electricity import BreakdownItem


class PortalModel(BaseModel):
    @field_serializer("*", when_used="json")
    def serialize_decimal(self, value):
        if isinstance(value, Decimal):
            return float(value)
        return value


class MyMeterReading(PortalModel):
    id: int
    meter_name: str
    previous_reading: Decimal
    current_reading: Decimal
    units_used: Decimal
    reading_date: date
    created_at: datetime


class MySubmitterContext(PortalModel):
    assigned: bool
    submitter_id: int | None = None
    submitter_name: str | None = None
    property_name: str | None = None
    property_place: str | None = None
    unit: str | None = None
    meter_name: str | None = None
    latest_reading: MyMeterReading | None = None
    tariff: list[ElectricitySlab] = Field(default_factory=list)


class MyMeterReadingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    reading_date: date = Field(default_factory=date.today)


class MyMeterReadingSubmitResponse(PortalModel):
    reading: MyMeterReading
    high_usage_warning: str | None = None


class MyBill(PortalModel):
    rate_mode: Literal["manual", "slab"] | None = None
    breakdown: list[BreakdownItem] = Field(default_factory=list)
    meter_name: str | None = None
    id: int
    invoice_number: str
    submitter_name: str
    property_name: str | None
    unit: str | None
    billing_period_start: date
    billing_period_end: date
    issued_at: datetime
    due_date: date
    status: Literal["pending", "overdue", "paid"]
    previous_reading: Decimal | None = None
    current_reading: Decimal | None = None
    units: Decimal
    rate_per_unit: Decimal | None = None
    tariff_label: str
    total_amount: Decimal
    payment_method: Literal["upi", "card", "net_banking"] | None = None
    transaction_id: str | None = None
    paid_at: datetime | None = None


class MyBillListResponse(PortalModel):
    items: list[MyBill]
    total: int


class DemoPaymentRequest(BaseModel):
    """Only the method is client-selected; payment state is server-owned."""

    model_config = ConfigDict(extra="forbid")

    payment_method: Literal["upi", "card", "net_banking"]


class ConsumptionPoint(PortalModel):
    month: str
    label: str
    units: Decimal


class MyConsumption(PortalModel):
    current_month_units: Decimal
    previous_month_units: Decimal
    absolute_change: Decimal
    percentage_change: Decimal | None
    history: list[ConsumptionPoint]
