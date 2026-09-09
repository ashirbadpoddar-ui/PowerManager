"""Create persistent property meter readings.

Revision ID: 0005_meter_readings
Revises: 0004_properties_submitters
"""

from typing import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0005_meter_readings"
down_revision: str | None = "0004_properties_submitters"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "meter_readings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("property_id", sa.Integer(), nullable=False),
        sa.Column("meter_name", sa.String(length=120), nullable=False),
        sa.Column("previous_reading", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("current_reading", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("reading_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("previous_reading >= 0", name="ck_meter_readings_previous_nonnegative"),
        sa.CheckConstraint("current_reading >= previous_reading", name="ck_meter_readings_current_not_lower"),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("property_id", "meter_name", "reading_date", name="uq_meter_readings_property_meter_date"),
    )
    op.create_index("ix_meter_readings_property_date", "meter_readings", ["property_id", "reading_date"])


def downgrade() -> None:
    op.drop_index("ix_meter_readings_property_date", table_name="meter_readings")
    op.drop_table("meter_readings")
