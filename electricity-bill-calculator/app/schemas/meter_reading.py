from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_serializer, field_validator, model_validator


class _DecimalJsonModel(BaseModel):
    """Keep meter reading values numeric in JSON responses."""

    @field_serializer("*", when_used="json", check_fields=False)
    def serialize_decimal_fields(self, value):
        return float(value) if isinstance(value, Decimal) else value


class MeterReadingCreate(BaseModel):
    property_id: int = Field(gt=0)
    submitter_id: int | None = Field(default=None, gt=0)
    meter_name: str = Field(min_length=1, max_length=120)
    previous_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    current_reading: Decimal = Field(ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    reading_date: date

    @field_validator("meter_name")
    @classmethod
    def clean_meter_name(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_reading_order(self):
        if self.current_reading < self.previous_reading:
            raise ValueError("Current reading cannot be lower than previous reading")
        return self


class MeterReadingUpdate(BaseModel):
    property_id: int | None = Field(default=None, gt=0)
    submitter_id: int | None = Field(default=None, gt=0)
    meter_name: str | None = Field(default=None, min_length=1, max_length=120)
    previous_reading: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    current_reading: Decimal | None = Field(default=None, ge=0, max_digits=18, decimal_places=6, allow_inf_nan=False)
    reading_date: date | None = None

    @field_validator("meter_name")
    @classmethod
    def clean_meter_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else value


class MeterReadingResponse(_DecimalJsonModel):
    id: int
    property_id: int
    property_name: str
    submitter_id: int | None
    submitter_name: str | None
    meter_name: str
    previous_reading: Decimal
    current_reading: Decimal
    units_used: Decimal
    reading_date: date
    created_at: datetime
    updated_at: datetime


class MeterReadingListResponse(BaseModel):
    items: list[MeterReadingResponse]
    total: int
