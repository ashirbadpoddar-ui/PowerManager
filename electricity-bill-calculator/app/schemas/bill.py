from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator, model_validator

from app.schemas.electricity import BreakdownItem, DetailedBillRequest


BillDisplayStatus = Literal["pending", "overdue", "paid", "void"]
BillCalculationType = Literal["simple", "main_meter", "submitter", "owner_common"]


class InvoiceMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_label: str = Field(min_length=1, max_length=120)
    property_label: str | None = Field(default=None, max_length=120)
    unit_label: str | None = Field(default=None, max_length=120)
    period_start: date
    period_end: date
    due_date: date

    @field_validator("recipient_label", mode="before")
    @classmethod
    def normalize_recipient_label(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("property_label", "unit_label", mode="before")
    @classmethod
    def normalize_optional_labels(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.due_date < self.period_end:
            raise ValueError("due_date must be on or after period_end")
        return self


class BillingRunMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    property_label: str | None = Field(default=None, max_length=120)
    unit_label: str | None = Field(default=None, max_length=120)
    period_start: date
    period_end: date
    due_date: date
    owner_recipient_label: str = Field(
        default="Owner / Common Area",
        min_length=1,
        max_length=120,
    )

    @field_validator("owner_recipient_label", mode="before")
    @classmethod
    def normalize_owner_label(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("property_label", "unit_label", mode="before")
    @classmethod
    def normalize_optional_labels(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @model_validator(mode="after")
    def validate_dates(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.due_date < self.period_end:
            raise ValueError("due_date must be on or after period_end")
        return self


class SimpleBillInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units: Decimal = Field(gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    fixed_charge: Decimal = Field(default=Decimal("0"), ge=0, max_digits=18, decimal_places=2, allow_inf_nan=False)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=9, decimal_places=6, allow_inf_nan=False)


class SimpleBillGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: UUID = Field(default_factory=uuid4)
    calculation: SimpleBillInput
    metadata: InvoiceMetadata


class DetailedBillGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: UUID = Field(default_factory=uuid4)
    property_id: int = Field(gt=0)
    calculation: DetailedBillRequest
    metadata: BillingRunMetadata


class SubmitterBillMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    period_start: date
    period_end: date
    due_date: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.period_end < self.period_start:
            raise ValueError("period_end must be on or after period_start")
        if self.due_date < self.period_end:
            raise ValueError("due_date must be on or after period_end")
        return self


class SubmitterBillGenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: UUID = Field(default_factory=uuid4)
    submitter_id: int = Field(gt=0)
    previous_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    current_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    rate_mode: Literal["manual", "slab"] = "slab"
    rate_per_unit: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    metadata: SubmitterBillMetadata

    @model_validator(mode="after")
    def validate_reading_and_rate(self):
        if self.current_reading < self.previous_reading:
            raise ValueError("Current reading cannot be lower than the previous reading")
        if self.rate_mode == "manual" and self.rate_per_unit is None:
            raise ValueError("A manual rate per unit is required")
        return self


class _DecimalJsonModel(BaseModel):
    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_decimal_fields(self, value):
        if isinstance(value, Decimal):
            return float(value)
        return value


class BillResponse(_DecimalJsonModel):
    previous_reading: Decimal | None = None
    current_reading: Decimal | None = None
    rate_per_unit: Decimal | None = None
    rate_mode: Literal["manual", "slab"] | None = None
    breakdown: list[BreakdownItem] = Field(default_factory=list)
    meter_name: str | None = None

    id: int
    bill_number: str
    created_by_user_id: int
    billing_run_id: int | None
    tariff_id: int | None
    submitter_id: int | None
    calculation_type: BillCalculationType
    recipient_label: str
    property_label: str | None
    unit_label: str | None
    period_start: date
    period_end: date
    issued_at: datetime
    due_date: date
    status: BillDisplayStatus
    total_units: Decimal
    energy_amount: Decimal
    fixed_charge: Decimal
    extra_charges: Decimal
    subtotal: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_at: datetime | None
    payment_method: Literal["upi", "card", "net_banking"] | None = None
    transaction_id: str | None = None
    voided_at: datetime | None
    created_at: datetime
    updated_at: datetime
    email_status: Literal["scheduled", "sent", "failed", "not_available"] | None = None


class BillListResponse(BaseModel):
    items: list[BillResponse]
    total: int


class BillDueDateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    due_date: date


class BillingRunResponse(_DecimalJsonModel):
    id: int
    created_by_user_id: int
    property_label: str | None
    unit_label: str | None
    period_start: date
    period_end: date
    issued_at: datetime
    due_date: date
    main_previous_reading: Decimal
    main_current_reading: Decimal
    main_meter_units: Decimal
    submitter_total_units: Decimal
    difference_units: Decimal
    default_rate: Decimal
    main_meter_amount: Decimal
    fixed_charge: Decimal
    main_extra_charge: Decimal
    tax_rate: Decimal
    subtotal: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    created_at: datetime


class DetailedBillGenerationResponse(BaseModel):
    billing_run: BillingRunResponse
    invoices: list[BillResponse]
