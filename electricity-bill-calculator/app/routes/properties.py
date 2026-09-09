from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.dependencies import require_administrator, require_administrator_csrf
from app.database.connection import get_db
from app.models.property import Property, Submitter
from app.models.user import User
from app.schemas.property import (
    PropertyCreate,
    PropertyListResponse,
    PropertyResponse,
    PropertyUpdate,
    SubmitterCreate,
    SubmitterAccountUpdate,
    SubmitterResponse,
)

router = APIRouter(prefix="/api/properties", tags=["properties"])


def get_owned_property(db: Session, user: User, property_id: int) -> Property:
    item = db.scalar(
        select(Property).options(selectinload(Property.submitters)).where(
            Property.id == property_id, Property.created_by_user_id == user.id
        )
    )
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found")
    return item


def serialize_property(item: Property) -> PropertyResponse:
    return PropertyResponse(
        id=item.id,
        created_by_user_id=item.created_by_user_id,
        name=item.name,
        place=item.place,
        unit=item.unit,
        submitters=[SubmitterResponse.model_validate(value) for value in item.submitters],
        submitter_count=len(item.submitters),
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


@router.get("", response_model=PropertyListResponse)
def list_properties(user: User = Depends(require_administrator), db: Session = Depends(get_db)):
    items = list(db.scalars(
        select(Property).options(selectinload(Property.submitters)).where(
            Property.created_by_user_id == user.id
        ).order_by(Property.created_at.desc(), Property.id.desc())
    ).unique().all())
    submitter_total = sum(len(item.submitters) for item in items)
    return PropertyListResponse(
        items=[serialize_property(item) for item in items],
        total=len(items),
        submitter_total=submitter_total,
    )


@router.post("", response_model=PropertyResponse, status_code=status.HTTP_201_CREATED)
def create_property(payload: PropertyCreate, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item = Property(created_by_user_id=user.id, **payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return serialize_property(item)


@router.patch("/{property_id}", response_model=PropertyResponse)
def update_property(property_id: int, payload: PropertyUpdate, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item = get_owned_property(db, user, property_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    return serialize_property(get_owned_property(db, user, property_id))


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(property_id: int, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item = get_owned_property(db, user, property_id)
    db.delete(item)
    db.commit()


@router.post("/{property_id}/submitters", response_model=SubmitterResponse, status_code=status.HTTP_201_CREATED)
def create_submitter(property_id: int, payload: SubmitterCreate, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    item = get_owned_property(db, user, property_id)
    submitter = Submitter(property_id=item.id, name=payload.name)
    db.add(submitter)
    db.commit()
    db.refresh(submitter)
    return submitter


@router.delete("/{property_id}/submitters/{submitter_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_submitter(property_id: int, submitter_id: int, user: User = Depends(require_administrator_csrf), db: Session = Depends(get_db)):
    get_owned_property(db, user, property_id)
    submitter = db.scalar(select(Submitter).where(Submitter.id == submitter_id, Submitter.property_id == property_id))
    if submitter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submitter not found")
    db.delete(submitter)
    db.commit()


@router.patch("/{property_id}/submitters/{submitter_id}/account", response_model=SubmitterResponse)
def assign_submitter_account(
    property_id: int,
    submitter_id: int,
    payload: SubmitterAccountUpdate,
    user: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
):
    """Link or unlink a normal login account from an admin-managed submitter."""

    get_owned_property(db, user, property_id)
    submitter = db.scalar(
        select(Submitter)
        .where(Submitter.id == submitter_id, Submitter.property_id == property_id)
        .with_for_update()
    )
    if submitter is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Submitter not found")

    if payload.user_id is not None:
        account = db.scalar(select(User).where(User.id == payload.user_id))
        if account is None or not account.is_active or account.role != "user":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Select an active normal User account",
            )
        existing = db.scalar(
            select(Submitter.id).where(
                Submitter.user_id == payload.user_id,
                Submitter.id != submitter.id,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This User account is already assigned to another submitter",
            )

    submitter.user_id = payload.user_id
    db.commit()
    db.refresh(submitter)
    return submitter
