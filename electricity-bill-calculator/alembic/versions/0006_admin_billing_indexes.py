"""Add lookup indexes used by Admin billing search and duplicate checks.

Legacy billing columns remain intact so historical invoices and identifiers are
not rewritten. New calculations ignore those legacy charge fields.
"""

from typing import Sequence

from alembic import op


revision: str = "0006_admin_billing_indexes"
down_revision: str | None = "0005_meter_readings"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_bills_creator_recipient_period", "bills", ["created_by_user_id", "recipient_label", "period_start", "period_end"])
    op.create_index("ix_bills_creator_due_date", "bills", ["created_by_user_id", "due_date"])


def downgrade() -> None:
    op.drop_index("ix_bills_creator_due_date", table_name="bills")
    op.drop_index("ix_bills_creator_recipient_period", table_name="bills")
