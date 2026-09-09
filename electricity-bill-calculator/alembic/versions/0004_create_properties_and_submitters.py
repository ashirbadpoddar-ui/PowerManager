"""Create persistent properties and submitters.

Revision ID: 0004_properties_submitters
Revises: 0003_independent_meter_billing
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0004_properties_submitters"
down_revision: str | None = "0003_independent_meter_billing"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "properties",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("place", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_properties_owner_created", "properties", ["created_by_user_id", "created_at"])
    op.create_table(
        "submitters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_submitters_property", "submitters", ["property_id"])


def downgrade() -> None:
    op.drop_index("ix_submitters_property", table_name="submitters")
    op.drop_table("submitters")
    op.drop_index("ix_properties_owner_created", table_name="properties")
    op.drop_table("properties")
