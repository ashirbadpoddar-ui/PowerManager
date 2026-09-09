"""add payment metadata and active submitter-period uniqueness

Revision ID: 0008_security_constraints
Revises: 0007_submitter_user_self_service
"""

from alembic import op
import sqlalchemy as sa


revision = "0008_security_constraints"
down_revision = "0007_submitter_user_self_service"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("bills", sa.Column("payment_method", sa.String(length=20), nullable=True))
    op.add_column("bills", sa.Column("transaction_id", sa.String(length=64), nullable=True))
    op.create_check_constraint(
        "ck_bills_payment_method",
        "bills",
        "payment_method IS NULL OR payment_method IN ('upi', 'card', 'net_banking')",
    )
    # Voided invoices remain re-issuable, matching the existing business rule.
    # Existing duplicate active rows must be resolved before this migration can
    # complete; silently dropping data here would weaken invoice integrity.
    op.create_index(
        "uq_bills_submitter_active_period",
        "bills",
        ["submitter_id", "period_start", "period_end"],
        unique=True,
        postgresql_where=sa.text("submitter_id IS NOT NULL AND status <> 'void'"),
    )


def downgrade() -> None:
    op.drop_index("uq_bills_submitter_active_period", table_name="bills")
    op.drop_constraint("ck_bills_payment_method", "bills", type_="check")
    op.drop_column("bills", "transaction_id")
    op.drop_column("bills", "payment_method")
