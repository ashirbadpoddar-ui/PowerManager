"""Separate submitter meter histories from property main-meter history.

Revision ID: 0009_submitter_meter
Revises: 0008_security_constraints
"""

from alembic import op
import sqlalchemy as sa


revision = "0009_submitter_meter"
down_revision = "0008_security_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meter_readings", sa.Column("submitter_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_meter_readings_submitter_id_submitters",
        "meter_readings",
        "submitters",
        ["submitter_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.drop_constraint("uq_meter_readings_property_meter_date", "meter_readings", type_="unique")
    op.create_index(
        "uq_meter_readings_main_property_meter_date",
        "meter_readings",
        ["property_id", "meter_name", "reading_date"],
        unique=True,
        postgresql_where=sa.text("submitter_id IS NULL"),
    )
    op.create_index(
        "uq_meter_readings_submitter_meter_date",
        "meter_readings",
        ["submitter_id", "meter_name", "reading_date"],
        unique=True,
        postgresql_where=sa.text("submitter_id IS NOT NULL"),
    )
    op.create_index("ix_meter_readings_submitter_date", "meter_readings", ["submitter_id", "reading_date"])


def downgrade() -> None:
    op.drop_index("ix_meter_readings_submitter_date", table_name="meter_readings")
    op.drop_index("uq_meter_readings_submitter_meter_date", table_name="meter_readings")
    op.drop_index("uq_meter_readings_main_property_meter_date", table_name="meter_readings")
    op.create_unique_constraint(
        "uq_meter_readings_property_meter_date",
        "meter_readings",
        ["property_id", "meter_name", "reading_date"],
    )
    op.drop_constraint("fk_meter_readings_submitter_id_submitters", "meter_readings", type_="foreignkey")
    op.drop_column("meter_readings", "submitter_id")
