"""Strictly scoped submitter self-service endpoints."""

from __future__ import annotations

from app.services.invoice_display import invoice_display_fields

import logging
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Literal, cast

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import require_operational_csrf_user, require_operational_user
from app.core.audit import security_event
from app.core.rate_limit import rate_limit
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.meter_reading import MeterReading
from app.models.property import Property, Submitter
from app.models.user import User
from app.schemas.portal import (
    ConsumptionPoint,
    MyBill,
    MyBillListResponse,
    MyConsumption,
    MyMeterReading,
    MyMeterReadingCreate,
    MyMeterReadingSubmitResponse,
    MySubmitterContext,
    DemoPaymentRequest,
)
from app.services.billing_service import _bill_status, demo_pay_bill
from app.services.email_service import PaymentEmailData, send_payment_success_email, deliver_notification, log_notification_failure
from app.services.settings_service import get_tariff_settings


router = APIRouter(prefix="/api/me", tags=["self service"])
logger = logging.getLogger(__name__)


def _require_submitter_user(user: User) -> User:
    if user.role != "user":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Submitter access required")
    return user


def _linked_submitter(db: Session, user: User) -> tuple[Submitter, Property] | None:
    row = db.execute(
        select(Submitter, Property)
        .join(Property, Submitter.property_id == Property.id)
        .where(Submitter.user_id == user.id)
    ).one_or_none()
    if row is None:
        return None
    submitter, property_ = row
    return submitter, property_


def _require_linked_submitter(db: Session, user: User) -> tuple[Submitter, Property]:
    linked = _linked_submitter(db, user)
    if linked is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No meter has been assigned to your account",
        )
    return linked


def _serialize_reading(item: MeterReading) -> MyMeterReading:
    return MyMeterReading(
        id=item.id,
        meter_name=item.meter_name,
        previous_reading=item.previous_reading,
        current_reading=item.current_reading,
        units_used=item.current_reading - item.previous_reading,
        reading_date=item.reading_date,
        created_at=item.created_at,
    )


def _latest_reading(db: Session, submitter_id: int) -> MeterReading | None:
    return db.scalar(
        select(MeterReading)
        .where(MeterReading.submitter_id == submitter_id)
        .order_by(MeterReading.reading_date.desc(), MeterReading.id.desc())
        .limit(1)
    )


def _decimal_snapshot(snapshot: dict[str, object], key: str) -> Decimal | None:
    value = snapshot.get(key)
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None


def _serialize_bill(item: Bill) -> MyBill:
    snapshot = item.result_snapshot or {}
    display = invoice_display_fields(snapshot)
    rate = display["rate_per_unit"]
    display_status = _bill_status(item)
    return MyBill(
        id=item.id,
        invoice_number=item.bill_number,
        submitter_name=item.recipient_label,
        property_name=item.property_label,
        unit=item.unit_label,
        billing_period_start=item.period_start,
        billing_period_end=item.period_end,
        issued_at=item.issued_at,
        due_date=item.due_date,
        status=display_status if display_status != "void" else "pending",
        **display,
        units=item.total_units,
        tariff_label=(f"₹{rate}/unit" if rate is not None else "Auto Slab" if display["rate_mode"] == "slab" else "Not recorded on this invoice"),
        total_amount=item.total_amount,
        payment_method=cast(
            Literal["upi", "card", "net_banking"] | None,
            item.payment_method,
        ),
        transaction_id=item.transaction_id,
        paid_at=item.paid_at,
    )


@router.get(
    "/submitter",
    response_model=MySubmitterContext,
    response_model_exclude_none=True,
)
def get_my_submitter(
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    linked = _linked_submitter(db, user)
    if linked is None:
        return MySubmitterContext(assigned=False)

    submitter, property_item = linked
    latest = _latest_reading(db, submitter.id)
    return MySubmitterContext(
        assigned=True,
        submitter_id=submitter.id,
        submitter_name=submitter.name,
        property_name=property_item.name,
        property_place=property_item.place,
        unit=property_item.unit,
        meter_name=latest.meter_name if latest is not None else "Main Meter",
        latest_reading=_serialize_reading(latest) if latest is not None else None,
        tariff=get_tariff_settings(db).slabs,
    )


@router.get("/meter-readings", response_model=list[MyMeterReading])
def list_my_meter_readings(
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    submitter, _ = _require_linked_submitter(db, user)
    readings = db.scalars(
        select(MeterReading)
        .where(MeterReading.submitter_id == submitter.id)
        .order_by(MeterReading.reading_date.desc(), MeterReading.id.desc())
    ).all()
    return [_serialize_reading(reading) for reading in readings]


@router.post("/meter-readings", response_model=MyMeterReadingSubmitResponse, status_code=status.HTTP_201_CREATED)
def submit_my_meter_reading(
    payload: MyMeterReadingCreate,
    user: User = Depends(require_operational_csrf_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    submitter, property_item = _require_linked_submitter(db, user)
    previous = _latest_reading(db, submitter.id)

    if previous is not None and payload.reading_date < previous.reading_date:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Reading date cannot be before your latest submitted reading",
        )

    previous_value = previous.current_reading if previous is not None else Decimal("0")
    if payload.current_reading < previous_value:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Current reading cannot be lower than the previous reading",
        )

    meter_name = previous.meter_name if previous is not None else "Main Meter"
    item = MeterReading(
        property_id=property_item.id,
        submitter_id=submitter.id,
        meter_name=meter_name,
        previous_reading=previous_value,
        current_reading=payload.current_reading,
        reading_date=payload.reading_date,
    )
    db.add(item)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A reading has already been submitted for this billing date",
        ) from exc
    db.refresh(item)

    units = item.current_reading - item.previous_reading
    prior_units = (
        previous.current_reading - previous.previous_reading
        if previous is not None
        else Decimal("0")
    )
    high_usage_warning = None
    if units > 0 and (units >= Decimal("100") or (prior_units > 0 and units > prior_units * 2)):
        high_usage_warning = "This reading is much higher than your previous usage. Please confirm it is correct."

    return MyMeterReadingSubmitResponse(
        reading=_serialize_reading(item), high_usage_warning=high_usage_warning
    )


@router.get("/bills", response_model=MyBillListResponse)
def list_my_bills(
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    submitter, _ = _require_linked_submitter(db, user)
    bills = list(
        db.scalars(
            select(Bill)
            .where(Bill.submitter_id == submitter.id, Bill.status != "void")
            .order_by(Bill.period_end.desc(), Bill.id.desc())
        ).all()
    )
    return MyBillListResponse(items=[_serialize_bill(item) for item in bills], total=len(bills))


@router.get("/bills/{bill_id}", response_model=MyBill)
def get_my_bill(
    bill_id: int,
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    submitter, _ = _require_linked_submitter(db, user)
    item = db.scalar(
        select(Bill).where(
            Bill.id == bill_id,
            Bill.submitter_id == submitter.id,
            Bill.status != "void",
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invoice not found")
    return _serialize_bill(item)


@router.post(
    "/bills/{bill_id}/demo-payment",
    response_model=MyBill,
    dependencies=[Depends(rate_limit("demo-payment", 10))],
)
async def complete_demo_payment(
    bill_id: int,
    payload: DemoPaymentRequest,
    user: User = Depends(require_operational_csrf_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    bill = demo_pay_bill(db, user, bill_id, payment_method=payload.payment_method)
    db.commit()
    db.refresh(bill)
    security_event("demo_payment_completed", user_id=user.id, resource_id=bill.id)
    try:
        await deliver_notification(send_payment_success_email, PaymentEmailData(
            user_name=user.name,
            user_email=user.email,
            invoice_id=bill.bill_number,
            paid_amount=bill.total_amount,
            payment_method=bill.payment_method or payload.payment_method,
            transaction_id=bill.transaction_id or "Recorded payment",
            paid_at=bill.paid_at.isoformat() if bill.paid_at is not None else "Recorded payment",
        ), "payment")
    except Exception as error:
        log_notification_failure("payment", bill.id, error)
    return _serialize_bill(bill)


def _month_key(value: date) -> str:
    return f"{value.year:04d}-{value.month:02d}"


def _month_start(value: date) -> date:
    return value.replace(day=1)


def _previous_month(value: date) -> date:
    first = _month_start(value)
    return date(first.year - 1, 12, 1) if first.month == 1 else date(first.year, first.month - 1, 1)


@router.get("/consumption", response_model=MyConsumption)
def get_my_consumption(
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
):
    _require_submitter_user(user)
    submitter, _ = _require_linked_submitter(db, user)
    readings = db.scalars(
        select(MeterReading)
        .where(MeterReading.submitter_id == submitter.id)
        .order_by(MeterReading.reading_date.asc(), MeterReading.id.asc())
    ).all()
    monthly: dict[str, Decimal] = {}
    for reading in readings:
        key = _month_key(reading.reading_date)
        monthly[key] = monthly.get(key, Decimal("0")) + (reading.current_reading - reading.previous_reading)

    current_month = _month_start(date.today())
    previous_month = _previous_month(current_month)
    current_units = monthly.get(_month_key(current_month), Decimal("0"))
    previous_units = monthly.get(_month_key(previous_month), Decimal("0"))
    percentage = None
    if previous_units > 0:
        percentage = (current_units - previous_units) * Decimal("100") / previous_units

    history: list[ConsumptionPoint] = []
    cursor = current_month
    for _ in range(12):
        key = _month_key(cursor)
        if key in monthly:
            history.append(
                ConsumptionPoint(
                    month=key,
                    label=cursor.strftime("%b %Y"),
                    units=monthly[key],
                )
            )
        cursor = _previous_month(cursor)
    history.reverse()

    return MyConsumption(
        current_month_units=current_units,
        previous_month_units=previous_units,
        absolute_change=current_units - previous_units,
        percentage_change=percentage,
        history=history,
    )
