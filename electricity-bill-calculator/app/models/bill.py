from datetime import date, datetime, timezone
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.user import utc_now

if TYPE_CHECKING:
    from app.models.property import Submitter
    from app.models.tariff import Tariff
    from app.models.user import User


UNIT_TYPE = Numeric(18, 6)
MONEY_TYPE = Numeric(18, 2)
RATE_TYPE = Numeric(18, 6)
TAX_RATE_TYPE = Numeric(9, 6)


def generate_bill_number() -> str:
    """Return a readable, high-entropy invoice number; uniqueness is DB-enforced."""

    day = datetime.now(timezone.utc).strftime("%Y%m%d")
    return f"BILL-{day}-{uuid4().hex[:20].upper()}"


class BillingRun(Base):
    """Parent reconciliation record for one detailed main-meter calculation."""

    __tablename__ = "billing_runs"
    __table_args__ = (
        UniqueConstraint(
            "created_by_user_id",
            "generation_key",
            name="uq_billing_runs_creator_generation_key",
        ),
        CheckConstraint("period_end >= period_start", name="ck_billing_runs_valid_period"),
        CheckConstraint("due_date >= period_end", name="ck_billing_runs_valid_due_date"),
        CheckConstraint(
            "main_previous_reading >= 0 AND main_current_reading >= main_previous_reading",
            name="ck_billing_runs_valid_main_readings",
        ),
        CheckConstraint("main_meter_units >= 0", name="ck_billing_runs_main_units_nonnegative"),
        CheckConstraint(
            "submitter_total_units >= 0",
            name="ck_billing_runs_submitter_units_nonnegative",
        ),
        CheckConstraint(
            "main_meter_units = main_current_reading - main_previous_reading",
            name="ck_billing_runs_main_units_match_readings",
        ),
        CheckConstraint(
            "difference_units = main_meter_units - submitter_total_units",
            name="ck_billing_runs_difference_matches_units",
        ),
        CheckConstraint("default_rate > 0", name="ck_billing_runs_default_rate_positive"),
        CheckConstraint(
            "main_meter_amount >= 0 AND fixed_charge >= 0 AND main_extra_charge >= 0",
            name="ck_billing_runs_charges_nonnegative",
        ),
        CheckConstraint(
            "subtotal >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND total_amount >= 0",
            name="ck_billing_runs_totals_nonnegative",
        ),
        CheckConstraint("tax_rate <= 100", name="ck_billing_runs_tax_rate_maximum"),
        CheckConstraint(
            "total_amount = subtotal + tax_amount",
            name="ck_billing_runs_total_matches_components",
        ),
        Index("ix_billing_runs_creator_issued", "created_by_user_id", "issued_at"),
        Index("ix_billing_runs_period", "period_start", "period_end"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_billing_runs_created_by_user_id_users",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    generation_key: Mapped[str] = mapped_column(String(36), nullable=False)
    property_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    unit_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    main_previous_reading: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    main_current_reading: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    main_meter_units: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    submitter_total_units: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    difference_units: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    default_rate: Mapped[Decimal] = mapped_column(RATE_TYPE, nullable=False)
    main_meter_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    fixed_charge: Mapped[Decimal] = mapped_column(
        MONEY_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    main_extra_charge: Mapped[Decimal] = mapped_column(
        MONEY_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    tax_rate: Mapped[Decimal] = mapped_column(
        TAX_RATE_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    subtotal: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    tax_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    request_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    result_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )

    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
    bills: Mapped[list["Bill"]] = relationship(
        back_populates="billing_run",
        passive_deletes=True,
        order_by="Bill.id",
    )


class Bill(Base):
    """A persisted invoice produced from a server-side bill calculation."""

    __tablename__ = "bills"
    __table_args__ = (
        UniqueConstraint("bill_number", name="uq_bills_bill_number"),
        UniqueConstraint(
            "created_by_user_id",
            "generation_key",
            name="uq_bills_creator_generation_key",
        ),
        CheckConstraint(
            "calculation_type IN ('simple', 'main_meter', 'submitter', 'owner_common')",
            name="ck_bills_calculation_type",
        ),
        CheckConstraint(
            "(calculation_type = 'simple' AND generation_key IS NOT NULL) OR "
            "(calculation_type <> 'simple' AND generation_key IS NULL)",
            name="ck_bills_generation_key_scope",
        ),
        CheckConstraint("status IN ('issued', 'paid', 'void')", name="ck_bills_status"),
        CheckConstraint("period_end >= period_start", name="ck_bills_valid_period"),
        CheckConstraint("due_date >= period_end", name="ck_bills_valid_due_date"),
        CheckConstraint("total_units >= 0", name="ck_bills_total_units_nonnegative"),
        CheckConstraint(
            "energy_amount >= 0 AND fixed_charge >= 0 AND extra_charges >= 0",
            name="ck_bills_charges_nonnegative",
        ),
        CheckConstraint(
            "subtotal >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND total_amount >= 0",
            name="ck_bills_totals_nonnegative",
        ),
        CheckConstraint("tax_rate <= 100", name="ck_bills_tax_rate_maximum"),
        CheckConstraint(
            "subtotal = energy_amount + fixed_charge + extra_charges",
            name="ck_bills_subtotal_matches_components",
        ),
        CheckConstraint(
            "total_amount = subtotal + tax_amount",
            name="ck_bills_total_matches_components",
        ),
        CheckConstraint(
            "status <> 'issued' OR (paid_at IS NULL AND paid_by_user_id IS NULL "
            "AND voided_at IS NULL AND voided_by_user_id IS NULL)",
            name="ck_bills_issued_audit_state",
        ),
        CheckConstraint(
            "status <> 'paid' OR (paid_at IS NOT NULL AND voided_at IS NULL "
            "AND voided_by_user_id IS NULL)",
            name="ck_bills_paid_audit_state",
        ),
        CheckConstraint(
            "status <> 'void' OR (voided_at IS NOT NULL AND paid_at IS NULL "
            "AND paid_by_user_id IS NULL)",
            name="ck_bills_void_audit_state",
        ),
        CheckConstraint("schema_version > 0", name="ck_bills_schema_version_positive"),
        Index("ix_bills_creator_status", "created_by_user_id", "status"),
        Index("ix_bills_status_due_date", "status", "due_date"),
        Index("ix_bills_billing_run_id", "billing_run_id"),
        Index("ix_bills_tariff_id", "tariff_id"),
        Index("ix_bills_paid_by_user_id", "paid_by_user_id"),
        Index("ix_bills_voided_by_user_id", "voided_by_user_id"),
        Index("ix_bills_period", "period_start", "period_end"),
        Index("ix_bills_submitter_id", "submitter_id"),
        Index(
            "uq_bills_submitter_active_period",
            "submitter_id",
            "period_start",
            "period_end",
            unique=True,
            postgresql_where=text("submitter_id IS NOT NULL AND status <> 'void'"),
        ),
        CheckConstraint(
            "payment_method IS NULL OR payment_method IN ('upi', 'card', 'net_banking')",
            name="ck_bills_payment_method",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_number: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default=generate_bill_number,
    )
    created_by_user_id: Mapped[int] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_bills_created_by_user_id_users",
            ondelete="RESTRICT",
        ),
        nullable=False,
    )
    generation_key: Mapped[str | None] = mapped_column(String(36), nullable=True)
    billing_run_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "billing_runs.id",
            name="fk_bills_billing_run_id_billing_runs",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )
    tariff_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "tariffs.id",
            name="fk_bills_tariff_id_tariffs",
            ondelete="RESTRICT",
        ),
        nullable=True,
    )
    # Existing invoices are intentionally left unlinked.  New submitter
    # invoices may use this relationship for strict self-service scoping.
    submitter_id: Mapped[int | None] = mapped_column(
        ForeignKey("submitters.id", ondelete="SET NULL"), nullable=True
    )
    calculation_type: Mapped[str] = mapped_column(String(32), nullable=False)
    recipient_label: Mapped[str] = mapped_column(String(200), nullable=False)
    property_label: Mapped[str | None] = mapped_column(String(200), nullable=True)
    unit_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="issued",
        server_default="issued",
    )
    total_units: Mapped[Decimal] = mapped_column(UNIT_TYPE, nullable=False)
    energy_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    fixed_charge: Mapped[Decimal] = mapped_column(
        MONEY_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    extra_charges: Mapped[Decimal] = mapped_column(
        MONEY_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    subtotal: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    tax_rate: Mapped[Decimal] = mapped_column(
        TAX_RATE_TYPE,
        nullable=False,
        default=Decimal("0"),
        server_default=text("0"),
    )
    tax_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(MONEY_TYPE, nullable=False)
    request_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    result_snapshot: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    schema_version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=text("1"),
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_bills_paid_by_user_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    payment_method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    transaction_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_bills_voided_by_user_id_users",
            ondelete="SET NULL",
        ),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        onupdate=utc_now,
        server_default=func.now(),
    )

    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
    paid_by: Mapped["User | None"] = relationship(foreign_keys=[paid_by_user_id])
    voided_by: Mapped["User | None"] = relationship(foreign_keys=[voided_by_user_id])
    billing_run: Mapped["BillingRun | None"] = relationship(back_populates="bills")
    tariff: Mapped["Tariff | None"] = relationship(back_populates="bills")
    submitter: Mapped["Submitter | None"] = relationship(foreign_keys=[submitter_id])
