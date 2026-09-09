from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator


class _DecimalJsonModel(BaseModel):
    """Serialize numeric calculation results as JSON numbers, not strings."""

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_decimal_fields(self, value):
        return float(value) if isinstance(value, Decimal) else value


class ElectricitySlab(BaseModel):
    min_units: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    max_units: Decimal | None = Field(default=None, gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    rate_per_unit: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_range(self):
        if self.max_units is not None and self.max_units <= self.min_units:
            raise ValueError("max_units must be greater than min_units")
        return self


class BillCalculationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    units: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    fixed_charge: Decimal = Field(default=Decimal("0"), ge=0, max_digits=18, decimal_places=2, allow_inf_nan=False)
    tax_rate: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=9, decimal_places=6, allow_inf_nan=False)
    slabs: list[ElectricitySlab] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_slabs(self):
        ordered = sorted(self.slabs, key=lambda slab: slab.min_units)
        if ordered[0].min_units != 0:
            raise ValueError("slabs must start at zero")
        for previous, current in zip(ordered, ordered[1:]):
            if previous.max_units != current.min_units:
                raise ValueError("slabs must be contiguous")
        if ordered[-1].max_units is not None:
            raise ValueError("the final slab must be open-ended")
        if self.units > ordered[-1].min_units and ordered[-1].max_units is not None:
            raise ValueError("slabs must cover the requested units")
        return self


class BreakdownItem(_DecimalJsonModel):
    slab_label: str
    units_in_slab: Decimal
    rate_per_unit: Decimal
    amount: Decimal


class BillCalculationResponse(_DecimalJsonModel):
    total_units: Decimal
    subtotal: Decimal
    fixed_charge: Decimal
    tax_rate: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    energy_amount: Decimal
    breakdown: list[BreakdownItem]


class DetailedMeterReading(BaseModel):
    model_config = ConfigDict(extra="forbid")

    previous_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    current_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    rate_per_unit: Decimal = Field(gt=0, max_digits=18, decimal_places=6, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_reading(self):
        if self.current_reading < self.previous_reading:
            raise ValueError("Current reading cannot be lower than previous reading")
        return self


class DetailedSubmitterReading(DetailedMeterReading):
    name: str = Field(min_length=1, max_length=120)
    submitter_id: int = Field(gt=0)


class DetailedBillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main_meter: DetailedMeterReading
    submitters: list[DetailedSubmitterReading]
 

class DetailedBillResponse(_DecimalJsonModel):
    main_meter: "MeterBillResult"
    submitters: list["SubmitterBillResult"]
    submitter_total_units: Decimal
    submitter_total_amount: Decimal


class MeterBillResult(_DecimalJsonModel):
    previous_reading: Decimal
    current_reading: Decimal
    units: Decimal
    rate_per_unit: Decimal
    total_amount: Decimal


class SubmitterBillResult(MeterBillResult):
    name: str


MainMeterReading = DetailedMeterReading
SubmitterReading = DetailedSubmitterReading


class SimpleBillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    main_meter: MainMeterReading
    submitters: list[SubmitterReading]


SimpleBillResponse = DetailedBillResponse
