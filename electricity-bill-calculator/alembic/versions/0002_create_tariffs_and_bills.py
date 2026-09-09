"""Create immutable tariffs, reconciliation runs, and persisted bills.

Revision ID: 0002_tariffs_bills
Revises: 0001_users_sessions
Create Date: 2026-08-26
"""

from decimal import Decimal
from typing import Sequence

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0002_tariffs_bills"
down_revision: str | None = "0001_users_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_EMBEDDED_SLABS: list[dict[str, Decimal | None]] = [
    {
        "min_units": Decimal("0"),
        "max_units": Decimal("100"),
        "rate_per_unit": Decimal("5"),
    },
    {
        "min_units": Decimal("100"),
        "max_units": Decimal("200"),
        "rate_per_unit": Decimal("7.5"),
    },
    {
        "min_units": Decimal("200"),
        "max_units": None,
        "rate_per_unit": Decimal("10"),
    },
]


def upgrade() -> None:
    op.create_table(
        "tariffs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column(
            "name",
            sa.String(length=120),
            server_default=sa.text("'Global tariff'"),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            server_default=sa.text("true"),
            nullable=False,
        ),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_tariffs_created_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.CheckConstraint("version > 0", name="ck_tariffs_version_positive"),
        sa.PrimaryKeyConstraint("id", name="pk_tariffs"),
        sa.UniqueConstraint("version", name="uq_tariffs_version"),
    )
    op.create_index(
        "ix_tariffs_created_by_user_id",
        "tariffs",
        ["created_by_user_id"],
        unique=False,
    )
    op.create_index("ix_tariffs_created_at", "tariffs", ["created_at"], unique=False)
    op.create_index(
        "uq_tariffs_single_active",
        "tariffs",
        ["is_active"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "tariff_slabs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("tariff_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("min_units", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("max_units", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("rate_per_unit", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.CheckConstraint(
            "position >= 0",
            name="ck_tariff_slabs_position_nonnegative",
        ),
        sa.CheckConstraint(
            "min_units >= 0",
            name="ck_tariff_slabs_min_units_nonnegative",
        ),
        sa.CheckConstraint(
            "max_units IS NULL OR max_units > min_units",
            name="ck_tariff_slabs_valid_range",
        ),
        sa.CheckConstraint(
            "rate_per_unit > 0",
            name="ck_tariff_slabs_rate_positive",
        ),
        sa.ForeignKeyConstraint(
            ["tariff_id"],
            ["tariffs.id"],
            name="fk_tariff_slabs_tariff_id_tariffs",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_tariff_slabs"),
        sa.UniqueConstraint(
            "tariff_id",
            "position",
            name="uq_tariff_slabs_tariff_position",
        ),
        sa.UniqueConstraint(
            "tariff_id",
            "min_units",
            name="uq_tariff_slabs_tariff_min_units",
        ),
    )
    op.create_index(
        "ix_tariff_slabs_tariff_id",
        "tariff_slabs",
        ["tariff_id"],
        unique=False,
    )

    op.create_table(
        "billing_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("generation_key", sa.String(length=36), nullable=False),
        sa.Column("property_label", sa.String(length=200), nullable=True),
        sa.Column("unit_label", sa.String(length=120), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "main_previous_reading",
            sa.Numeric(precision=18, scale=6),
            nullable=False,
        ),
        sa.Column(
            "main_current_reading",
            sa.Numeric(precision=18, scale=6),
            nullable=False,
        ),
        sa.Column("main_meter_units", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column(
            "submitter_total_units",
            sa.Numeric(precision=18, scale=6),
            nullable=False,
        ),
        sa.Column("difference_units", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("default_rate", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("main_meter_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "fixed_charge",
            sa.Numeric(precision=18, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "main_extra_charge",
            sa.Numeric(precision=18, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "tax_rate",
            sa.Numeric(precision=9, scale=6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("subtotal", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "request_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "result_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "period_end >= period_start",
            name="ck_billing_runs_valid_period",
        ),
        sa.CheckConstraint(
            "due_date >= period_end",
            name="ck_billing_runs_valid_due_date",
        ),
        sa.CheckConstraint(
            "main_previous_reading >= 0 AND main_current_reading >= main_previous_reading",
            name="ck_billing_runs_valid_main_readings",
        ),
        sa.CheckConstraint(
            "main_meter_units >= 0",
            name="ck_billing_runs_main_units_nonnegative",
        ),
        sa.CheckConstraint(
            "submitter_total_units >= 0",
            name="ck_billing_runs_submitter_units_nonnegative",
        ),
        sa.CheckConstraint(
            "main_meter_units = main_current_reading - main_previous_reading",
            name="ck_billing_runs_main_units_match_readings",
        ),
        sa.CheckConstraint(
            "difference_units = main_meter_units - submitter_total_units",
            name="ck_billing_runs_difference_matches_units",
        ),
        sa.CheckConstraint(
            "difference_units >= 0",
            name="ck_billing_runs_difference_nonnegative",
        ),
        sa.CheckConstraint(
            "default_rate > 0",
            name="ck_billing_runs_default_rate_positive",
        ),
        sa.CheckConstraint(
            "main_meter_amount >= 0 AND fixed_charge >= 0 AND main_extra_charge >= 0",
            name="ck_billing_runs_charges_nonnegative",
        ),
        sa.CheckConstraint(
            "subtotal >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND total_amount >= 0",
            name="ck_billing_runs_totals_nonnegative",
        ),
        sa.CheckConstraint(
            "tax_rate <= 100",
            name="ck_billing_runs_tax_rate_maximum",
        ),
        sa.CheckConstraint(
            "total_amount = subtotal + tax_amount",
            name="ck_billing_runs_total_matches_components",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_billing_runs_created_by_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_billing_runs"),
        sa.UniqueConstraint(
            "created_by_user_id",
            "generation_key",
            name="uq_billing_runs_creator_generation_key",
        ),
    )
    op.create_index(
        "ix_billing_runs_creator_issued",
        "billing_runs",
        ["created_by_user_id", "issued_at"],
        unique=False,
    )
    op.create_index(
        "ix_billing_runs_period",
        "billing_runs",
        ["period_start", "period_end"],
        unique=False,
    )

    op.create_table(
        "bills",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bill_number", sa.String(length=40), nullable=False),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("generation_key", sa.String(length=36), nullable=True),
        sa.Column("billing_run_id", sa.Integer(), nullable=True),
        sa.Column("tariff_id", sa.Integer(), nullable=True),
        sa.Column("calculation_type", sa.String(length=32), nullable=False),
        sa.Column("recipient_label", sa.String(length=200), nullable=False),
        sa.Column("property_label", sa.String(length=200), nullable=True),
        sa.Column("unit_label", sa.String(length=120), nullable=True),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "issued_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=16),
            server_default=sa.text("'issued'"),
            nullable=False,
        ),
        sa.Column("total_units", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("energy_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "fixed_charge",
            sa.Numeric(precision=18, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column(
            "extra_charges",
            sa.Numeric(precision=18, scale=2),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("subtotal", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "tax_rate",
            sa.Numeric(precision=9, scale=6),
            server_default=sa.text("0"),
            nullable=False,
        ),
        sa.Column("tax_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=18, scale=2), nullable=False),
        sa.Column(
            "request_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "result_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "schema_version",
            sa.Integer(),
            server_default=sa.text("1"),
            nullable=False,
        ),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paid_by_user_id", sa.Integer(), nullable=True),
        sa.Column("voided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("voided_by_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "calculation_type IN ('simple', 'submitter', 'owner_common')",
            name="ck_bills_calculation_type",
        ),
        sa.CheckConstraint(
            "(calculation_type = 'simple' AND generation_key IS NOT NULL) OR "
            "(calculation_type <> 'simple' AND generation_key IS NULL)",
            name="ck_bills_generation_key_scope",
        ),
        sa.CheckConstraint(
            "status IN ('issued', 'paid', 'void')",
            name="ck_bills_status",
        ),
        sa.CheckConstraint("period_end >= period_start", name="ck_bills_valid_period"),
        sa.CheckConstraint("due_date >= period_end", name="ck_bills_valid_due_date"),
        sa.CheckConstraint(
            "total_units >= 0",
            name="ck_bills_total_units_nonnegative",
        ),
        sa.CheckConstraint(
            "energy_amount >= 0 AND fixed_charge >= 0 AND extra_charges >= 0",
            name="ck_bills_charges_nonnegative",
        ),
        sa.CheckConstraint(
            "subtotal >= 0 AND tax_rate >= 0 AND tax_amount >= 0 AND total_amount >= 0",
            name="ck_bills_totals_nonnegative",
        ),
        sa.CheckConstraint("tax_rate <= 100", name="ck_bills_tax_rate_maximum"),
        sa.CheckConstraint(
            "subtotal = energy_amount + fixed_charge + extra_charges",
            name="ck_bills_subtotal_matches_components",
        ),
        sa.CheckConstraint(
            "total_amount = subtotal + tax_amount",
            name="ck_bills_total_matches_components",
        ),
        sa.CheckConstraint(
            "status <> 'issued' OR (paid_at IS NULL AND paid_by_user_id IS NULL "
            "AND voided_at IS NULL AND voided_by_user_id IS NULL)",
            name="ck_bills_issued_audit_state",
        ),
        sa.CheckConstraint(
            "status <> 'paid' OR (paid_at IS NOT NULL AND voided_at IS NULL "
            "AND voided_by_user_id IS NULL)",
            name="ck_bills_paid_audit_state",
        ),
        sa.CheckConstraint(
            "status <> 'void' OR (voided_at IS NOT NULL AND paid_at IS NULL "
            "AND paid_by_user_id IS NULL)",
            name="ck_bills_void_audit_state",
        ),
        sa.CheckConstraint(
            "schema_version > 0",
            name="ck_bills_schema_version_positive",
        ),
        sa.ForeignKeyConstraint(
            ["billing_run_id"],
            ["billing_runs.id"],
            name="fk_bills_billing_run_id_billing_runs",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["users.id"],
            name="fk_bills_created_by_user_id_users",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["paid_by_user_id"],
            ["users.id"],
            name="fk_bills_paid_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["tariff_id"],
            ["tariffs.id"],
            name="fk_bills_tariff_id_tariffs",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["voided_by_user_id"],
            ["users.id"],
            name="fk_bills_voided_by_user_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_bills"),
        sa.UniqueConstraint(
            "created_by_user_id",
            "generation_key",
            name="uq_bills_creator_generation_key",
        ),
        sa.UniqueConstraint("bill_number", name="uq_bills_bill_number"),
    )
    op.create_index(
        "ix_bills_billing_run_id",
        "bills",
        ["billing_run_id"],
        unique=False,
    )
    op.create_index(
        "ix_bills_creator_status",
        "bills",
        ["created_by_user_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_bills_period",
        "bills",
        ["period_start", "period_end"],
        unique=False,
    )
    op.create_index(
        "ix_bills_paid_by_user_id",
        "bills",
        ["paid_by_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_bills_status_due_date",
        "bills",
        ["status", "due_date"],
        unique=False,
    )
    op.create_index("ix_bills_tariff_id", "bills", ["tariff_id"], unique=False)
    op.create_index(
        "ix_bills_voided_by_user_id",
        "bills",
        ["voided_by_user_id"],
        unique=False,
    )

    tariffs_table = sa.table(
        "tariffs",
        sa.column("id", sa.Integer()),
        sa.column("version", sa.Integer()),
        sa.column("name", sa.String(length=120)),
        sa.column("is_active", sa.Boolean()),
    )
    op.execute(
        sa.insert(tariffs_table).values(
            version=1,
            name="Imported global tariff",
            is_active=True,
        )
    )

    tariff_slabs_table = sa.table(
        "tariff_slabs",
        sa.column("tariff_id", sa.Integer()),
        sa.column("position", sa.Integer()),
        sa.column("min_units", sa.Numeric(precision=18, scale=6)),
        sa.column("max_units", sa.Numeric(precision=18, scale=6)),
        sa.column("rate_per_unit", sa.Numeric(precision=18, scale=6)),
    )
    tariff_id = (
        sa.select(tariffs_table.c.id)
        .where(tariffs_table.c.version == 1)
        .scalar_subquery()
    )
    for position, slab in enumerate(_EMBEDDED_SLABS):
        op.execute(
            sa.insert(tariff_slabs_table).values(
                tariff_id=tariff_id,
                position=position,
                **slab,
            )
        )


def downgrade() -> None:
    op.drop_index("ix_bills_voided_by_user_id", table_name="bills")
    op.drop_index("ix_bills_tariff_id", table_name="bills")
    op.drop_index("ix_bills_status_due_date", table_name="bills")
    op.drop_index("ix_bills_paid_by_user_id", table_name="bills")
    op.drop_index("ix_bills_period", table_name="bills")
    op.drop_index("ix_bills_creator_status", table_name="bills")
    op.drop_index("ix_bills_billing_run_id", table_name="bills")
    op.drop_table("bills")

    op.drop_index("ix_billing_runs_period", table_name="billing_runs")
    op.drop_index("ix_billing_runs_creator_issued", table_name="billing_runs")
    op.drop_table("billing_runs")

    op.drop_index("ix_tariff_slabs_tariff_id", table_name="tariff_slabs")
    op.drop_table("tariff_slabs")

    op.drop_index("uq_tariffs_single_active", table_name="tariffs")
    op.drop_index("ix_tariffs_created_at", table_name="tariffs")
    op.drop_index("ix_tariffs_created_by_user_id", table_name="tariffs")
    op.drop_table("tariffs")
