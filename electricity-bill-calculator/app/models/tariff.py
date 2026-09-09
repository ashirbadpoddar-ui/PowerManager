from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.user import utc_now

if TYPE_CHECKING:
    from app.models.bill import Bill
    from app.models.user import User


class Tariff(Base):
    """An immutable version of the application's global electricity tariff."""

    __tablename__ = "tariffs"
    __table_args__ = (
        CheckConstraint("version > 0", name="ck_tariffs_version_positive"),
        UniqueConstraint("version", name="uq_tariffs_version"),
        Index(
            "uq_tariffs_single_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active"),
        ),
        Index("ix_tariffs_created_by_user_id", "created_by_user_id"),
        Index("ix_tariffs_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        default="Global tariff",
        server_default="Global tariff",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=text("true"),
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "users.id",
            name="fk_tariffs_created_by_user_id_users",
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

    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_user_id])
    slabs: Mapped[list["TariffSlab"]] = relationship(
        back_populates="tariff",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="TariffSlab.position",
    )
    bills: Mapped[list["Bill"]] = relationship(
        back_populates="tariff",
        passive_deletes=True,
    )


class TariffSlab(Base):
    """A half-open unit range belonging to one tariff version."""

    __tablename__ = "tariff_slabs"
    __table_args__ = (
        CheckConstraint("position >= 0", name="ck_tariff_slabs_position_nonnegative"),
        CheckConstraint("min_units >= 0", name="ck_tariff_slabs_min_units_nonnegative"),
        CheckConstraint(
            "max_units IS NULL OR max_units > min_units",
            name="ck_tariff_slabs_valid_range",
        ),
        CheckConstraint("rate_per_unit > 0", name="ck_tariff_slabs_rate_positive"),
        UniqueConstraint("tariff_id", "position", name="uq_tariff_slabs_tariff_position"),
        UniqueConstraint("tariff_id", "min_units", name="uq_tariff_slabs_tariff_min_units"),
        Index("ix_tariff_slabs_tariff_id", "tariff_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tariff_id: Mapped[int] = mapped_column(
        ForeignKey(
            "tariffs.id",
            name="fk_tariff_slabs_tariff_id_tariffs",
            ondelete="CASCADE",
        ),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    min_units: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)
    max_units: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    rate_per_unit: Mapped[Decimal] = mapped_column(Numeric(18, 6), nullable=False)

    tariff: Mapped["Tariff"] = relationship(back_populates="slabs")
