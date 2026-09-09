from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.models.tariff import Tariff, TariffSlab
from app.schemas.settings import ElectricitySlab, TariffSettings


def default_tariff_settings() -> TariffSettings:
    return TariffSettings(
        slabs=[
            ElectricitySlab(
                min_units=Decimal("0"),
                max_units=Decimal("100"),
                rate_per_unit=Decimal("5.0"),
            ),
            ElectricitySlab(
                min_units=Decimal("100"),
                max_units=Decimal("200"),
                rate_per_unit=Decimal("7.5"),
            ),
            ElectricitySlab(
                min_units=Decimal("200"),
                max_units=None,
                rate_per_unit=Decimal("10.0"),
            ),
        ]
    )


def get_active_tariff(db: Session, *, for_update: bool = False) -> Tariff:
    statement = (
        select(Tariff)
        .options(selectinload(Tariff.slabs))
        .where(Tariff.is_active.is_(True))
    )
    if for_update:
        statement = statement.with_for_update()
    tariff = db.scalar(statement)
    if tariff is None:
        raise ValueError("No active tariff is configured")
    return tariff


def tariff_to_settings(tariff: Tariff) -> TariffSettings:
    return TariffSettings(
        slabs=[
            ElectricitySlab(
                min_units=slab.min_units,
                max_units=slab.max_units,
                rate_per_unit=slab.rate_per_unit,
            )
            for slab in sorted(tariff.slabs, key=lambda item: item.position)
        ]
    )


def get_tariff_settings(db: Session) -> TariffSettings:
    return tariff_to_settings(get_active_tariff(db))


def save_tariff_settings(
    db: Session,
    settings: TariffSettings,
    *,
    created_by_user_id: int,
    name: str = "Global tariff",
) -> TariffSettings:
    validated = TariffSettings.model_validate(settings)
    current = get_active_tariff(db, for_update=True)
    current.is_active = False
    db.flush()

    next_version = (db.scalar(select(func.max(Tariff.version))) or 0) + 1
    replacement = Tariff(
        version=next_version,
        name=name,
        is_active=True,
        created_by_user_id=created_by_user_id,
    )
    db.add(replacement)
    db.flush()

    replacement.slabs = [
        TariffSlab(
            tariff_id=replacement.id,
            position=position,
            min_units=slab.min_units,
            max_units=slab.max_units,
            rate_per_unit=slab.rate_per_unit,
        )
        for position, slab in enumerate(validated.slabs)
    ]
    db.flush()
    return tariff_to_settings(replacement)
