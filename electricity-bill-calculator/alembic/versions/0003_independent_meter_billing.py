"""Allow independent main-meter invoices and unmatched submitter usage.

Revision ID: 0003_independent_meter_billing
Revises: 0002_tariffs_bills
"""

from typing import Sequence

from alembic import op


revision: str = "0003_independent_meter_billing"
down_revision: str | None = "0002_tariffs_bills"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_billing_runs_difference_nonnegative",
        "billing_runs",
        type_="check",
    )
    op.drop_constraint("ck_bills_calculation_type", "bills", type_="check")
    op.create_check_constraint(
        "ck_bills_calculation_type",
        "bills",
        "calculation_type IN ('simple', 'main_meter', 'submitter', 'owner_common')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_bills_calculation_type", "bills", type_="check")
    op.create_check_constraint(
        "ck_bills_calculation_type",
        "bills",
        "calculation_type IN ('simple', 'submitter', 'owner_common')",
    )
    op.create_check_constraint(
        "ck_billing_runs_difference_nonnegative",
        "billing_runs",
        "difference_units >= 0",
    )
