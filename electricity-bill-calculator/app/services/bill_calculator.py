from decimal import Decimal, ROUND_HALF_UP

from app.schemas.electricity import (
    BillCalculationRequest,
    BillCalculationResponse,
    BreakdownItem,
    DetailedBillRequest,
    DetailedBillResponse,
    MeterBillResult,
    SimpleBillRequest,
    SimpleBillResponse,
    SubmitterBillResult,
)

CENT = Decimal("0.01")
MAX_MONEY = Decimal("9999999999999999.99")


def _money(value: Decimal) -> Decimal:
    result = value.quantize(CENT, rounding=ROUND_HALF_UP)
    if result > MAX_MONEY:
        raise ValueError("calculated amount exceeds the supported INR limit")
    return result


def calculate_bill(request: BillCalculationRequest) -> BillCalculationResponse:
    energy = Decimal("0")
    breakdown: list[BreakdownItem] = []
    remaining = request.units
    for slab in sorted(request.slabs, key=lambda item: item.min_units):
        if remaining <= 0:
            break
        upper = slab.max_units if slab.max_units is not None else request.units
        slab_units = min(remaining, upper - slab.min_units)
        if slab_units <= 0:
            continue
        energy += slab_units * slab.rate_per_unit
        breakdown.append(BreakdownItem(
            slab_label=(f"{slab.min_units}-{slab.max_units}" if slab.max_units is not None else f"{slab.min_units}+"),
            units_in_slab=slab_units,
            rate_per_unit=slab.rate_per_unit,
            amount=_money(slab_units * slab.rate_per_unit),
        ))
        remaining -= slab_units
    if remaining > 0:
        raise ValueError("slabs must cover the requested units")
    subtotal = _money(energy)
    # Legacy request fields remain accepted for old clients, but new bills use
    # only units and tariff rates.
    fixed_charge = Decimal("0")
    tax_amount = Decimal("0")
    return BillCalculationResponse(
        total_units=request.units, energy_amount=_money(energy),
        subtotal=subtotal, fixed_charge=fixed_charge,
        tax_rate=Decimal("0"), tax_amount=tax_amount,
        total_amount=_money(subtotal), breakdown=breakdown,
    )


def calculate_simple_bill(request: BillCalculationRequest) -> BillCalculationResponse:
    return calculate_bill(request)


def calculate_detailed_bill(request: DetailedBillRequest) -> DetailedBillResponse:
    def meter_result(previous: Decimal, current: Decimal, rate: Decimal) -> MeterBillResult:
        units = current - previous
        return MeterBillResult(
            previous_reading=previous,
            current_reading=current,
            units=units,
            rate_per_unit=rate,
            total_amount=_money(units * rate),
        )

    main_meter = meter_result(
        request.main_meter.previous_reading,
        request.main_meter.current_reading,
        request.main_meter.rate_per_unit,
    )
    submitters = [
        SubmitterBillResult(
            name=item.name,
            **meter_result(item.previous_reading, item.current_reading, item.rate_per_unit).model_dump(),
        )
        for item in request.submitters
    ]
    return DetailedBillResponse(
        main_meter=main_meter,
        submitters=submitters,
        submitter_total_units=sum((item.units for item in submitters), 0),
        submitter_total_amount=round(sum((item.total_amount for item in submitters), 0), 2),
    )


def calculate_meter_bill(request: SimpleBillRequest) -> SimpleBillResponse:
    main_units = request.main_meter.current_reading - request.main_meter.previous_reading
    main_result = MeterBillResult(
        previous_reading=request.main_meter.previous_reading,
        current_reading=request.main_meter.current_reading, units=main_units,
        rate_per_unit=request.main_meter.rate_per_unit,
        total_amount=round(main_units * request.main_meter.rate_per_unit, 2),
    )
    submitters = []
    for item in request.submitters:
        item_units = item.current_reading - item.previous_reading
        submitters.append(SubmitterBillResult(
            name=item.name, previous_reading=item.previous_reading,
            current_reading=item.current_reading, units=item_units,
            rate_per_unit=item.rate_per_unit,
            total_amount=round(item_units * item.rate_per_unit, 2),
        ))
    return SimpleBillResponse(
        main_meter=main_result, submitters=submitters,
        submitter_total_units=sum((item.units for item in submitters), 0),
        submitter_total_amount=round(sum((item.total_amount for item in submitters), 0), 2),
    )
