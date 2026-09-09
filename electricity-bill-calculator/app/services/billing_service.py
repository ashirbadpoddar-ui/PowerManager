from __future__ import annotations

import secrets
import logging
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Literal, cast
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import require_administrator
from app.models.bill import Bill, BillingRun
from app.models.property import Property, Submitter
from app.models.user import User
from app.schemas.bill import (
    BillResponse,
    BillingRunResponse,
    DetailedBillGenerateRequest,
    SimpleBillGenerateRequest,
    SubmitterBillGenerateRequest,
)
from app.schemas.electricity import BillCalculationRequest
from app.services import bill_calculator as _bill_calculator
from app.services.settings_service import get_active_tariff, tariff_to_settings

from app.services.invoice_display import invoice_display_fields

logger = logging.getLogger(__name__)


def _snapshot_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, BaseModel):
        return _snapshot_value(value.model_dump(mode="python"))
    if isinstance(value, dict):
        return {str(key): _snapshot_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_snapshot_value(item) for item in value]
    return value


def _bill_status(bill: Bill) -> Literal["pending", "overdue", "paid", "void"]:
    if bill.status == "paid":
        return "paid"
    if bill.status == "void":
        return "void"
    if bill.due_date < date.today():
        return "overdue"
    return "pending"


def serialize_bill(bill: Bill) -> BillResponse:
    return BillResponse(
        **invoice_display_fields(bill.result_snapshot),
        id=bill.id,
        bill_number=bill.bill_number,
        created_by_user_id=bill.created_by_user_id,
        billing_run_id=bill.billing_run_id,
        tariff_id=bill.tariff_id,
        submitter_id=bill.submitter_id,
        calculation_type=cast(Any, bill.calculation_type),
    
        recipient_label=bill.recipient_label,
        property_label=bill.property_label,
        unit_label=bill.unit_label,
        period_start=bill.period_start,
        period_end=bill.period_end,
        issued_at=bill.issued_at,
        due_date=bill.due_date,
        status=_bill_status(bill),
        total_units=bill.total_units,
        energy_amount=bill.energy_amount,
        fixed_charge=bill.fixed_charge,
        extra_charges=bill.extra_charges,
        subtotal=bill.subtotal,
        tax_rate=bill.tax_rate,
        tax_amount=bill.tax_amount,
        total_amount=bill.total_amount,
        paid_at=bill.paid_at,
        payment_method=bill.payment_method,
        transaction_id=bill.transaction_id,
        voided_at=bill.voided_at,
        created_at=bill.created_at,
        updated_at=bill.updated_at,
    )


def serialize_billing_run(run: BillingRun) -> BillingRunResponse:
    return BillingRunResponse(
        id=run.id,
        created_by_user_id=run.created_by_user_id,
        property_label=run.property_label,
        unit_label=run.unit_label,
        period_start=run.period_start,
        period_end=run.period_end,
        issued_at=run.issued_at,
        due_date=run.due_date,
        main_previous_reading=run.main_previous_reading,
        main_current_reading=run.main_current_reading,
        main_meter_units=run.main_meter_units,
        submitter_total_units=run.submitter_total_units,
        difference_units=run.difference_units,
        default_rate=run.default_rate,
        main_meter_amount=run.main_meter_amount,
        fixed_charge=run.fixed_charge,
        main_extra_charge=run.main_extra_charge,
        tax_rate=run.tax_rate,
        subtotal=run.subtotal,
        tax_amount=run.tax_amount,
        total_amount=run.total_amount,
        created_at=run.created_at,
    )


def create_submitter_bill(
    db: Session,
    user: User,
    payload: SubmitterBillGenerateRequest,
) -> Bill:
    row = db.execute(
        select(Submitter, Property)
        .join(Property, Submitter.property_id == Property.id)
        .where(
            Submitter.id == payload.submitter_id,
            Property.created_by_user_id == user.id,
        )
    ).one_or_none()
    if row is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Submitter not found",
        )

    submitter, property_item = row
    if submitter.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Assign a user before generating an invoice",
        )

    duplicate = db.scalar(
        select(Bill).where(
            Bill.submitter_id == submitter.id,
            Bill.period_start == payload.metadata.period_start,
            Bill.period_end == payload.metadata.period_end,
            Bill.status != "void",
        )
    )
    if duplicate is not None:
        logger.warning("duplicate_invoice_rejected submitter_id=%s", submitter.id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An invoice already exists for this user and billing period.",
        )

    tariff = get_active_tariff(db)
    tariff_settings = tariff_to_settings(tariff)
    units = payload.current_reading - payload.previous_reading

    if payload.rate_mode == "manual":
        rate = payload.rate_per_unit
        if rate is None:
            raise ValueError("A manual rate per unit is required")
        amount = _bill_calculator._money(units * rate)
        breakdown = []
    else:
        # Rebuild the calculation-schema models from the settings payload.
        # The settings and calculation modules intentionally have separate
        # validation models, so passing their instances directly would cause
        # Pydantic to reject an otherwise valid slab configuration.
        result = _bill_calculator.calculate_bill(
            BillCalculationRequest(
                units=units,
                fixed_charge=Decimal("0"),
                tax_rate=Decimal("0"),
                slabs=[slab.model_dump() for slab in tariff_settings.slabs],
            )
        )
        rate = None
        amount = result.total_amount
        breakdown = result.breakdown

    snapshot = {
        "previous_reading": payload.previous_reading,
        "current_reading": payload.current_reading,
        "units": units,
        "rate_mode": payload.rate_mode,
        "rate_per_unit": rate,
        "breakdown": breakdown,
        "tariff": {
            "id": tariff.id,
            "version": tariff.version,
            "slabs": tariff_settings.slabs,
        },
    }
    bill = Bill(
        created_by_user_id=user.id,
        tariff_id=tariff.id,
        submitter_id=submitter.id,
        calculation_type="submitter",
        recipient_label=submitter.name,
        property_label=property_item.name,
        unit_label=property_item.unit,
        period_start=payload.metadata.period_start,
        period_end=payload.metadata.period_end,
        due_date=payload.metadata.due_date,
        total_units=units,
        energy_amount=amount,
        fixed_charge=Decimal("0.00"),
        extra_charges=Decimal("0.00"),
        subtotal=amount,
        tax_rate=Decimal("0.00"),
        tax_amount=Decimal("0.00"),
        total_amount=amount,
        request_snapshot=_snapshot_value(payload),
        result_snapshot=_snapshot_value(snapshot),
    )
    db.add(bill)
    db.flush()
    return bill


def create_simple_bill(
    db: Session,
    user: User,
    payload: SimpleBillGenerateRequest,
) -> Bill:
    generation_key = str(payload.idempotency_key)
    existing = get_simple_bill_by_generation_key(db, user, generation_key)
    if existing is not None:
        return existing

    duplicate = db.scalar(select(Bill).where(
        Bill.created_by_user_id == user.id,
        Bill.recipient_label == payload.metadata.recipient_label,
        Bill.period_start == payload.metadata.period_start,
        Bill.period_end == payload.metadata.period_end,
        Bill.calculation_type == "simple",
        Bill.status != "void",
    ))
    if duplicate is not None:
        logger.warning("duplicate_invoice_rejected creator_id=%s", user.id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A bill already exists for this submitter and billing period.")

    tariff = get_active_tariff(db)
    tariff_settings = tariff_to_settings(tariff)
    request = payload.calculation.model_copy(
        update={"slabs": tariff_settings.slabs}
    )
   
    calculate_simple_bill = cast(
        Any,
        getattr(_bill_calculator, "calculate_simple_bill"),
    )
    result = calculate_simple_bill(cast(Any, request))
    metadata = payload.metadata

    bill = Bill(
        created_by_user_id=user.id,
        generation_key=generation_key,
        tariff_id=tariff.id,
        calculation_type="simple",
        recipient_label=metadata.recipient_label,
        property_label=metadata.property_label,
        unit_label=metadata.unit_label,
        period_start=metadata.period_start,
        period_end=metadata.period_end,
        due_date=metadata.due_date,
     
        total_units=request.units,
        energy_amount=result.energy_amount,
        fixed_charge=result.fixed_charge,
        extra_charges=Decimal("0.00"),
        subtotal=result.energy_amount + result.fixed_charge,
        tax_rate=result.tax_rate,
        tax_amount=result.tax_amount,
        total_amount=result.total_amount,
        request_snapshot=_snapshot_value(
            {
                "calculation": request,
                "metadata": metadata,
                "tariff": {
                    "id": tariff.id,
                    "version": tariff.version,
                    "slabs": tariff_settings.slabs,
                },
            }
        ),
        result_snapshot=_snapshot_value(result),
    )
    db.add(bill)
    db.flush()
    return bill


def _meter_invoice(
    *,
    user: User,
    run: BillingRun,
    payload: DetailedBillGenerateRequest,
    line,
    calculation_type: str,
    recipient_label: str,
    request_line: object | None,
) -> Bill:

    metadata = payload.metadata

    return Bill(
        created_by_user_id=user.id,

        billing_run_id=run.id,

        tariff_id=None,

        # Only submitter invoices have an account scope.  Main-meter and
        # legacy invoices deliberately remain unassigned.
        submitter_id=(
            getattr(request_line, "submitter_id", None)
            if calculation_type == "submitter"
            else None
        ),

        calculation_type=calculation_type,

        recipient_label=recipient_label,

        property_label=metadata.property_label,

        unit_label=metadata.unit_label,

        period_start=metadata.period_start,

        period_end=metadata.period_end,

        due_date=metadata.due_date,

        # Normal meter calculation
        total_units=line.units,

        energy_amount=line.total_amount,

        # No fixed charge
        fixed_charge=Decimal("0.00"),

        # No extra charge
        extra_charges=Decimal("0.00"),

        subtotal=line.total_amount,

        # No GST / Tax
        tax_rate=Decimal("0.00"),

        tax_amount=Decimal("0.00"),

        total_amount=line.total_amount,

        request_snapshot=_snapshot_value(
            {
                "meter": request_line,
                "metadata": metadata,
                "billing_run_id": run.id,
            }
        ),

        result_snapshot=_snapshot_value(line),
    )


def create_detailed_billing_run(
    db: Session,
    user: User,
    payload: DetailedBillGenerateRequest,
) -> tuple[BillingRun, list[Bill]]:

    # ---------------------------------
    # Prevent duplicate bill generation
    # ---------------------------------

    generation_key = str(payload.idempotency_key)

    existing = get_detailed_run_by_generation_key(
        db,
        user,
        generation_key,
    )

    if existing is not None:
        return existing, list(existing.bills)


    # ---------------------------------
    # Calculate meter bills
    # ---------------------------------

    property_item = db.scalar(
        select(Property)
        .options(selectinload(Property.submitters).selectinload(Submitter.user))
        .where(Property.id == payload.property_id, Property.created_by_user_id == user.id)
    )
    if property_item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")

    metadata = payload.metadata.model_copy(update={"property_label": property_item.name, "unit_label": property_item.unit})
    linked_submitters = {item.id: item for item in property_item.submitters}
    seen_ids: set[int] = set()
    authoritative_submitters = []
    for requested in payload.calculation.submitters:
        submitter = linked_submitters.get(requested.submitter_id)
        if submitter is None:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Selected submitter does not belong to this property")
        if submitter.user is None or not submitter.user.is_active:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Selected submitter needs an active linked account")
        if submitter.id in seen_ids:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A bill was requested more than once for the same submitter and billing period.")
        duplicate = db.scalar(select(Bill.id).where(Bill.submitter_id == submitter.id, Bill.period_start == metadata.period_start, Bill.period_end == metadata.period_end, Bill.status != "void"))
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An invoice already exists for this user and billing period.")
        seen_ids.add(submitter.id)
        authoritative_submitters.append(requested.model_copy(update={"name": submitter.name}))
    calculation = payload.calculation.model_copy(update={"submitters": authoritative_submitters})
    payload = payload.model_copy(update={"calculation": calculation, "metadata": metadata})

  
    calculate_detailed_bill = cast(Any, getattr(_bill_calculator, "calculate_detailed_bill"))
    result = calculate_detailed_bill(calculation)


    # ---------------------------------
    # Main meter
    # ---------------------------------

    main_meter = result.main_meter


    difference_units = main_meter.units - result.submitter_total_units
    all_amount = main_meter.total_amount + result.submitter_total_amount


    # ---------------------------------
    # Save billing run
    # ---------------------------------

    run = BillingRun(
        created_by_user_id=user.id,

        generation_key=generation_key,

        property_label=metadata.property_label,

        unit_label=metadata.unit_label,

        period_start=metadata.period_start,

        period_end=metadata.period_end,

        due_date=metadata.due_date,

        main_previous_reading=(
            calculation.main_meter.previous_reading
        ),

        main_current_reading=(
            calculation.main_meter.current_reading
        ),

        main_meter_units=main_meter.units,

        submitter_total_units=(
            result.submitter_total_units
        ),

        difference_units=difference_units,

        # Main meter rate
        default_rate=main_meter.rate_per_unit,

        main_meter_amount=main_meter.total_amount,

        # Independent meter billing has no shared charges or tax.
        fixed_charge=Decimal("0.00"),

        main_extra_charge=Decimal("0.00"),

        tax_rate=Decimal("0.00"),

        subtotal=all_amount,

        tax_amount=Decimal("0.00"),

        total_amount=all_amount,

        request_snapshot=_snapshot_value(payload),

        result_snapshot=_snapshot_value(result),
    )


    db.add(run)

    db.flush()


    # ---------------------------------
    # Main Meter Bill
    # ---------------------------------

    main_bill = _meter_invoice(
        user=user,

        run=run,

        payload=payload,

        line=main_meter,

        calculation_type="main_meter",

        recipient_label="Main Meter",

        request_line=calculation.main_meter,
    )


    # ---------------------------------
    # Submitter Bills
    # ---------------------------------

    submitter_bills = []
    for request_submitter, result_submitter in zip(
        calculation.submitters,
        result.submitters,
        strict=True,
    ):

        request_line = request_submitter
        bill = _meter_invoice(
            user=user,

            run=run,

            payload=payload,

            line=result_submitter,

            calculation_type="submitter",

            recipient_label=result_submitter.name,

            request_line=request_line,
        )


        submitter_bills.append(bill)


    # ---------------------------------
    # Save all bills
    # ---------------------------------

    invoices = [
        main_bill,
        *submitter_bills,
    ]


    db.add_all(invoices)

    db.flush()


    return run, invoices


def get_simple_bill_by_generation_key(
    db: Session,
    user: User,
    generation_key: str,
) -> Bill | None:
    return db.scalar(
        select(Bill).where(
            Bill.created_by_user_id == user.id,
            Bill.generation_key == generation_key,
            Bill.calculation_type == "simple",
        )
    )


def get_detailed_run_by_generation_key(
    db: Session,
    user: User,
    generation_key: str,
) -> BillingRun | None:
    return db.scalar(
        select(BillingRun)
        .options(selectinload(BillingRun.bills))
        .where(
            BillingRun.created_by_user_id == user.id,
            BillingRun.generation_key == generation_key,
        )
    )


def _visible_bill_statement(user: User):
    statement = select(Bill)
    if user.role != "administrator":
        statement = statement.where(
            (Bill.created_by_user_id == user.id)
            | Bill.submitter.has(Submitter.user_id == user.id)
        )
    return statement


def list_visible_bills(
    db: Session,
    user: User,
    *,
    offset: int,
    limit: int,
) -> tuple[list[Bill], int]:
    visibility = [] if user.role == "administrator" else [Bill.created_by_user_id == user.id]
    total = db.scalar(select(func.count(Bill.id)).where(*visibility)) or 0
    bills = list(
        db.scalars(
            select(Bill)
            .where(*visibility)
            .order_by(Bill.created_at.desc(), Bill.id.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    return bills, total


def get_visible_bill(db: Session, user: User, bill_id: int) -> Bill:
    bill = db.scalar(_visible_bill_statement(user).where(Bill.id == bill_id))
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


def _lock_visible_bill(db: Session, user: User, bill_id: int) -> Bill:
    bill = db.scalar(
        _visible_bill_statement(user).where(Bill.id == bill_id).with_for_update()
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found")
    return bill


def mark_bill_paid(
    db: Session,
    user: User,
    bill_id: int,
) -> Bill:
    """Administrator confirmation; bill visibility alone never permits this action."""
    require_administrator(user)
    bill = _lock_visible_bill(db, user, bill_id)
    return _record_payment(db, user, bill)


def demo_pay_bill(
    db: Session,
    user: User,
    bill_id: int,
    *,
    payment_method: Literal["upi", "card", "net_banking"],
) -> Bill:
    """Simulate payment only for the currently assigned recipient, not the creator."""
    if user.role != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Submitter access required")
    bill = db.scalar(
        select(Bill).where(
            Bill.id == bill_id,
            Bill.submitter.has(Submitter.user_id == user.id),
        ).with_for_update()
    )
    if bill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return _record_payment(db, user, bill, payment_method=payment_method)


def _record_payment(
    db: Session, user: User, bill: Bill, *, payment_method: str | None = None,
) -> Bill:
    if bill.status != "issued":
        logger.warning("payment_rejected bill_id=%s user_id=%s status=%s", bill.id, user.id, bill.status)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an unpaid issued bill can be marked paid",
        )
    bill.status = "paid"
    bill.paid_at = datetime.now(timezone.utc)
    bill.paid_by_user_id = user.id
    if payment_method is not None:
        bill.payment_method = payment_method
        bill.transaction_id = (
            f"DEMO-PAY-{bill.paid_at.strftime('%Y%m%d')}-{secrets.token_hex(8).upper()}"
        )
    db.flush()
    return bill


def update_bill_due_date(db: Session, user: User, bill_id: int, due_date: date) -> Bill:
    require_administrator(user)
    bill = _lock_visible_bill(db, user, bill_id)
    if bill.status in {"paid", "void"}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only active bills can have their due date changed")
    if due_date < bill.period_end:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Due date must be on or after the billing period")
    bill.due_date = due_date
    db.flush()
    return bill


def void_bill(db: Session, user: User, bill_id: int) -> Bill:
    require_administrator(user)
    bill = _lock_visible_bill(db, user, bill_id)
    if bill.status != "issued":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only an unpaid issued bill can be voided",
        )
    bill.status = "void"
    bill.voided_at = datetime.now(timezone.utc)
    bill.voided_by_user_id = user.id
    db.flush()
    return bill
