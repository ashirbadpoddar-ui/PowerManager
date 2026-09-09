from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import (
    require_administrator_csrf,
    require_operational_user,
)
from app.database.connection import get_db
from app.models.meter_reading import MeterReading
from app.models.property import Property, Submitter
from app.models.user import User
from app.schemas.meter_reading import MeterReadingCreate, MeterReadingListResponse, MeterReadingResponse, MeterReadingUpdate


router = APIRouter(prefix="/api/meter-readings", tags=["meter readings"])


def get_owned_property(db: Session, user: User, property_id: int) -> Property:
    item = db.scalar(select(Property).where(Property.id == property_id, Property.created_by_user_id == user.id))
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    return item


def get_owned_submitter(db: Session, user: User, property_id: int, submitter_id: int) -> Submitter:
    item = db.scalar(
        select(Submitter)
        .join(Property, Submitter.property_id == Property.id)
        .where(
            Submitter.id == submitter_id,
            Submitter.property_id == property_id,
            Property.created_by_user_id == user.id,
        )
    )
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Selected submitter does not belong to this property",
        )
    return item


def get_owned_reading(db: Session, user: User, reading_id: int) -> tuple[MeterReading, Property, Submitter | None]:
    row = db.execute(
        select(MeterReading, Property, Submitter)
        .join(Property, MeterReading.property_id == Property.id)
        .outerjoin(Submitter, MeterReading.submitter_id == Submitter.id)
        .where(MeterReading.id == reading_id, Property.created_by_user_id == user.id)
    ).one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Meter reading not found")
    item, property_item, submitter = row
    return item, property_item, submitter


def serialize(item: MeterReading, property_item: Property, submitter: Submitter | None = None) -> MeterReadingResponse:
    return MeterReadingResponse(
        id=item.id,
        property_id=item.property_id,
        property_name=property_item.name,
        submitter_id=item.submitter_id,
        submitter_name=submitter.name if submitter is not None else None,
        meter_name=item.meter_name,
        previous_reading=item.previous_reading,
        current_reading=item.current_reading,
        units_used=item.current_reading - item.previous_reading,
        reading_date=item.reading_date,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def commit_or_conflict(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A reading already exists for this property, meter, and date") from exc


@router.get("", response_model=MeterReadingListResponse)
def list_meter_readings(user: User = Depends(require_operational_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(MeterReading, Property, Submitter)
        .join(Property, MeterReading.property_id == Property.id)
        .outerjoin(Submitter, MeterReading.submitter_id == Submitter.id)
        .where(Property.created_by_user_id == user.id)
        .order_by(MeterReading.reading_date.desc(), MeterReading.id.desc())
    ).all()
    return MeterReadingListResponse(items=[serialize(item, property_item, submitter) for item, property_item, submitter in rows], total=len(rows))


@router.post("", response_model=MeterReadingResponse, status_code=status.HTTP_201_CREATED)
def create_meter_reading(payload: MeterReadingCreate, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    property_item = get_owned_property(db, user, payload.property_id)
    submitter = (
        get_owned_submitter(db, user, property_item.id, payload.submitter_id)
        if payload.submitter_id is not None
        else None
    )
    item = MeterReading(**payload.model_dump())
    db.add(item)
    commit_or_conflict(db)
    db.refresh(item)
    return serialize(item, property_item, submitter)


@router.patch("/{reading_id}", response_model=MeterReadingResponse)
def update_meter_reading(reading_id: int, payload: MeterReadingUpdate, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item, property_item, submitter = get_owned_reading(db, user, reading_id)
    updates = payload.model_dump(exclude_unset=True)
    if "property_id" in updates:
        property_item = get_owned_property(db, user, updates["property_id"])
    effective_submitter_id = updates.get("submitter_id", item.submitter_id)
    if effective_submitter_id is not None:
        submitter = get_owned_submitter(db, user, property_item.id, effective_submitter_id)
    else:
        submitter = None
    for key, value in updates.items():
        setattr(item, key, value)
    if item.current_reading < item.previous_reading:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Current reading cannot be lower than previous reading")
    commit_or_conflict(db)
    db.refresh(item)
    return serialize(item, property_item, submitter)


@router.delete("/{reading_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_meter_reading(reading_id: int, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item, _, _ = get_owned_reading(db, user, reading_id)
    db.delete(item)
    db.commit()
