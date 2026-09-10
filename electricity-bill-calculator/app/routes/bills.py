import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import (
    require_administrator,
    require_administrator_csrf,
)
from app.core.audit import security_event
from app.core.rate_limit import rate_limit
from app.database.connection import get_db
from app.models.user import User
from app.models.bill import Bill
from app.schemas.bill import (
    BillListResponse,
    BillResponse,
    DetailedBillGenerateRequest,
    DetailedBillGenerationResponse,
    BillDueDateUpdate,
    SimpleBillGenerateRequest,
    SubmitterBillGenerateRequest,
)
from app.services.billing_service import (
    create_detailed_billing_run,
    create_simple_bill,
    create_submitter_bill,
    get_detailed_run_by_generation_key,
    get_simple_bill_by_generation_key,
    get_visible_bill,
    list_visible_bills,
    mark_bill_paid,
    serialize_bill,
    serialize_billing_run,
    void_bill,
    update_bill_due_date,
)
from app.services.email_service import (
    EmailStatus, InvoiceEmailData, PaymentEmailData, deliver_notification,
    email_notification_available, send_invoice_email, send_payment_success_email,
    notification_logger, log_notification_failure,
)


router = APIRouter(prefix="/api/bills", tags=["bills"])
logger = logging.getLogger(__name__)


def _schedule_invoice_email(bill: Bill, tasks: BackgroundTasks) -> str:
    """Called after commit; the task receives only an immutable value snapshot."""
    try:
        recipient = bill.submitter.user if bill.submitter is not None else None
        if recipient is None:
            notification_logger.warning("invoice_email_skipped invoice_id=%s reason=no_assigned_user", bill.id)
            return EmailStatus.NOT_AVAILABLE.value
        if not email_notification_available(recipient.email):
            notification_logger.warning("invoice_email_skipped invoice_id=%s reason=recipient_or_configuration_unavailable", bill.id)
            return EmailStatus.NOT_AVAILABLE.value
        snapshot = bill.result_snapshot or {}
        data = InvoiceEmailData(
            user_name=recipient.name, user_email=recipient.email,
            invoice_id=bill.bill_number, property_name=bill.property_label or bill.unit_label,
            billing_period=f"{bill.period_start} to {bill.period_end}",
            previous_reading=snapshot.get("previous_reading"),
            current_reading=snapshot.get("current_reading"), units=bill.total_units,
            rate=snapshot.get("rate_per_unit"), total_amount=bill.total_amount,
            due_date=str(bill.due_date),
        )
        tasks.add_task(deliver_notification, send_invoice_email, data, "invoice")
        return EmailStatus.SCHEDULED.value
    except Exception as error:
        log_notification_failure("invoice", bill.id, error)
        return EmailStatus.NOT_AVAILABLE.value


def _persistence_error(db: Session, exc: Exception) -> HTTPException:
    db.rollback()
    if isinstance(exc, IntegrityError):
        logger.warning("billing_persistence_conflict error_type=%s", type(exc).__name__)
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The billing operation conflicted with another update",
        )
    logger.warning("billing_validation_failure error_type=%s", type(exc).__name__)
    return HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="The billing operation could not be completed",
    )


@router.post(
    "/simple",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("invoice-generation", 10))],
)
def generate_simple_bill(
    payload: SimpleBillGenerateRequest,
    request: Request,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> BillResponse:
    try:
        bill = create_simple_bill(db, current_user, payload)
        db.commit()
        db.refresh(bill)
        security_event("invoice_generated", request=request, user_id=current_user.id, resource_id=bill.id)
        response = serialize_bill(bill)
        response.email_status = EmailStatus.NOT_AVAILABLE.value
        notification_logger.warning("invoice_email_skipped invoice_id=%s reason=no_assigned_user", bill.id)
        return response
    except IntegrityError as exc:
        db.rollback()
        replay = get_simple_bill_by_generation_key(
            db,
            current_user,
            str(payload.idempotency_key),
        )
        if replay is not None:
            return serialize_bill(replay)
        raise _persistence_error(db, exc) from exc
    except ValueError as exc:
        raise _persistence_error(db, exc) from exc


@router.post(
    "/submitter",
    response_model=BillResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("invoice-generation", 10))],
)
async def generate_submitter_bill(
    payload: SubmitterBillGenerateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> BillResponse:
    try:
        bill = create_submitter_bill(db, current_user, payload)
        db.commit()
        db.refresh(bill)
        response = serialize_bill(bill)
        security_event("invoice_generated", request=request, user_id=current_user.id, resource_id=bill.id)
        response.email_status = _schedule_invoice_email(bill, background_tasks)
        return response
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise _persistence_error(db, exc) from exc
    except ValueError as exc:
        raise _persistence_error(db, exc) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Unexpected error while generating submitter invoice")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Invoice generation failed. Please check the server logs and try again.",
        ) from exc


@router.post(
    "/detailed",
    response_model=DetailedBillGenerationResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("invoice-generation", 10))],
)
async def generate_detailed_bills(
    payload: DetailedBillGenerateRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> DetailedBillGenerationResponse:
    try:
        existing = get_detailed_run_by_generation_key(db, current_user, str(payload.idempotency_key))
        if existing is not None:
            return DetailedBillGenerationResponse(
                billing_run=serialize_billing_run(existing),
                invoices=[serialize_bill(invoice) for invoice in existing.bills],
            )
        billing_run, invoices = create_detailed_billing_run(db, current_user, payload)
        db.commit()
        db.refresh(billing_run)
        for invoice in invoices:
            db.refresh(invoice)
        security_event("invoice_generated", request=request, user_id=current_user.id)
        responses = [serialize_bill(invoice) for invoice in invoices]
        for invoice, response in zip(invoices, responses, strict=True):
            response.email_status = _schedule_invoice_email(invoice, background_tasks)
        return DetailedBillGenerationResponse(billing_run=serialize_billing_run(billing_run), invoices=responses)
    except IntegrityError as exc:
        db.rollback()
        replay = get_detailed_run_by_generation_key(
            db,
            current_user,
            str(payload.idempotency_key),
        )
        if replay is not None:
            return DetailedBillGenerationResponse(
                billing_run=serialize_billing_run(replay),
                invoices=[serialize_bill(invoice) for invoice in replay.bills],
            )
        raise _persistence_error(db, exc) from exc
    except ValueError as exc:
        raise _persistence_error(db, exc) from exc


@router.get("", response_model=BillListResponse)
def list_bills(
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(require_administrator),
    db: Session = Depends(get_db),
) -> BillListResponse:
    bills, total = list_visible_bills(db, current_user, offset=offset, limit=limit)
    return BillListResponse(
        items=[serialize_bill(bill) for bill in bills],
        total=total,
    )


@router.get("/{bill_id}", response_model=BillResponse)
def get_bill(
    bill_id: int,
    current_user: User = Depends(require_administrator),
    db: Session = Depends(get_db),
) -> BillResponse:
    return serialize_bill(get_visible_bill(db, current_user, bill_id))


@router.post(
    "/{bill_id}/mark-paid",
    response_model=BillResponse,
    dependencies=[Depends(rate_limit("payment-action", 20))],
)
async def pay_bill(
    bill_id: int,
    request: Request,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> BillResponse:
    bill = mark_bill_paid(db, current_user, bill_id)
    db.commit()
    db.refresh(bill)
    security_event("invoice_marked_paid", request=request, user_id=current_user.id, resource_id=bill.id)
    try:
        recipient = bill.submitter.user if bill.submitter is not None else None
        if recipient is None:
            notification_logger.warning("payment_email_skipped invoice_id=%s reason=no_assigned_user", bill.id)
        else:
            await deliver_notification(send_payment_success_email, PaymentEmailData(
                user_name=recipient.name, user_email=recipient.email,
                invoice_id=bill.bill_number, paid_amount=bill.total_amount,
                payment_method=bill.payment_method or "Administrator recorded",
                transaction_id=bill.transaction_id or "Recorded payment",
                paid_at=bill.paid_at.isoformat() if bill.paid_at else "Recorded payment",
            ), "payment")
    except Exception as error:
        log_notification_failure("payment", bill.id, error)
    return serialize_bill(bill)


@router.post("/{bill_id}/void", response_model=BillResponse)
def cancel_bill(
    bill_id: int,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> BillResponse:
    bill = void_bill(db, current_user, bill_id)
    db.commit()
    db.refresh(bill)
    return serialize_bill(bill)


@router.patch("/{bill_id}/due-date", response_model=BillResponse)
def change_bill_due_date(
    bill_id: int,
    payload: BillDueDateUpdate,
    current_user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> BillResponse:
    bill = update_bill_due_date(db, current_user, bill_id, payload.due_date)
    db.commit()
    db.refresh(bill)
    return serialize_bill(bill)
