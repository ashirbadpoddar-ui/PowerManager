"""link submitters to user accounts for self-service

Revision ID: 0007_submitter_user_self_service
Revises: 0006_admin_billing_indexes
Create Date: 2026-09-02
"""

from alembic import op
import sqlalchemy as sa


revision = "0007_submitter_user_self_service"
down_revision = "0006_admin_billing_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Nullable fields keep historical submitters and invoices untouched until
    # an administrator explicitly links an account / generates a new bill.
    op.add_column("submitters", sa.Column("user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_submitters_user_id_users",
        "submitters",
        "users",
        ["user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_unique_constraint("uq_submitters_user_id", "submitters", ["user_id"])
    op.create_index("ix_submitters_user_id", "submitters", ["user_id"])

    op.add_column("bills", sa.Column("submitter_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_bills_submitter_id_submitters",
        "bills",
        "submitters",
        ["submitter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bills_submitter_id", "bills", ["submitter_id"])


def downgrade() -> None:
    op.drop_index("ix_bills_submitter_id", table_name="bills")
    op.drop_constraint("fk_bills_submitter_id_submitters", "bills", type_="foreignkey")
    op.drop_column("bills", "submitter_id")

    op.drop_index("ix_submitters_user_id", table_name="submitters")
    op.drop_constraint("uq_submitters_user_id", "submitters", type_="unique")
    op.drop_constraint("fk_submitters_user_id_users", "submitters", type_="foreignkey")
    op.drop_column("submitters", "user_id")
