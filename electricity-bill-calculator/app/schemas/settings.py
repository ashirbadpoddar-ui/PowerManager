from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Sequence, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, model_validator


def _decimal_as_json_number(value: Decimal) -> float:
    """Keep Decimal internally while preserving the frontend's JSON number contract."""

    return float(value)


DecimalNumber: TypeAlias = Annotated[
    Decimal,
    PlainSerializer(_decimal_as_json_number, return_type=float, when_used="json"),
]


class ElectricitySlab(BaseModel):
    model_config = ConfigDict(extra="forbid")

    """A half-open tariff interval: ``[min_units, max_units)``."""

    min_units: DecimalNumber = Field(
        ...,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=6,
        allow_inf_nan=False,
        description="Inclusive starting unit for the slab",
    )
    max_units: DecimalNumber | None = Field(
        None,
        ge=Decimal("0"),
        max_digits=18,
        decimal_places=6,
        allow_inf_nan=False,
        description="Exclusive ending unit for the slab. None means unlimited",
    )
    rate_per_unit: DecimalNumber = Field(
        ...,
        gt=Decimal("0"),
        max_digits=18,
        decimal_places=6,
        allow_inf_nan=False,
        description="Rate applied for this slab",
    )

    @model_validator(mode="after")
    def validate_bounds(self):
        if self.max_units is not None and self.max_units <= self.min_units:
            raise ValueError("A slab's max_units must be greater than min_units")
        return self


def validate_contiguous_slabs(slabs: Sequence[ElectricitySlab]) -> None:
    """Validate ordered, gap-free half-open coverage beginning at zero."""

    if not slabs:
        raise ValueError("At least one slab is required")
    if slabs[0].min_units != Decimal("0"):
        raise ValueError("The first slab must start at 0 units")

    for index, slab in enumerate(slabs):
        if slab.max_units is None:
            if index != len(slabs) - 1:
                raise ValueError("Only the final slab may have no max_units")
            continue

        if index < len(slabs) - 1:
            next_slab = slabs[index + 1]
            if next_slab.min_units != slab.max_units:
                raise ValueError(
                    "Slabs must be ordered and contiguous: each min_units must "
                    "equal the preceding max_units"
                )


class TariffSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    slabs: list[ElectricitySlab] = Field(
        ...,
        min_length=1,
        description="Ordered, contiguous half-open tariff slabs",
    )

    @model_validator(mode="after")
    def validate_slabs_order(self):
        validate_contiguous_slabs(self.slabs)
        return self


class WorkspaceResetResponse(BaseModel):
    properties_cleared: int
    submitters_cleared: int
    meter_readings_cleared: int
    bills_cleared: int
    billing_runs_cleared: int
    tariff_defaults_restored: bool
