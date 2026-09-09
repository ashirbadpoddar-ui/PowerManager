from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, Numeric, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database.base import Base


READING_TYPE = Numeric(18, 6)


class MeterReading(Base):
    __tablename__ = "meter_readings"
    __table_args__ = (
        CheckConstraint("previous_reading >= 0", name="ck_meter_readings_previous_nonnegative"),
        CheckConstraint("current_reading >= previous_reading", name="ck_meter_readings_current_not_lower"),
        # Main/common readings are property-scoped. Submitter readings have a
        # separate history, so two submitters may record the same meter label
        # on the same date without colliding.
        Index(
            "uq_meter_readings_main_property_meter_date",
            "property_id", "meter_name", "reading_date",
            unique=True,
            postgresql_where=text("submitter_id IS NULL"),
        ),
        Index(
            "uq_meter_readings_submitter_meter_date",
            "submitter_id", "meter_name", "reading_date",
            unique=True,
            postgresql_where=text("submitter_id IS NOT NULL"),
        ),
        Index("ix_meter_readings_property_date", "property_id", "reading_date"),
        Index("ix_meter_readings_submitter_date", "submitter_id", "reading_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    # NULL is reserved for administrator-managed main/common readings kept as
    # property history. Every user-facing reading is tied to its submitter.
    submitter_id: Mapped[int | None] = mapped_column(
        ForeignKey("submitters.id", ondelete="SET NULL"), nullable=True
    )
    meter_name: Mapped[str] = mapped_column(String(120), nullable=False)
    previous_reading: Mapped[Decimal] = mapped_column(READING_TYPE, nullable=False)
    current_reading: Mapped[Decimal] = mapped_column(READING_TYPE, nullable=False)
    reading_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())
