"""Small, permission-scoped dropdown search over existing records."""

from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import require_operational_user
from app.database.connection import get_db
from app.models.bill import Bill
from app.models.property import Property, Submitter
from app.models.user import User

router = APIRouter(prefix="/api/search", tags=["search"])
PER_GROUP_LIMIT = 5


class SearchResult(BaseModel):
    kind: Literal["property", "submitter", "invoice"]
    id: int
    title: str
    secondary: str
    property_id: int | None = None


class SearchResponse(BaseModel):
    items: list[SearchResult]


@router.get("", response_model=SearchResponse)
def search_records(
    response: Response,
    q: str = Query(default="", max_length=100),
    user: User = Depends(require_operational_user),
    db: Session = Depends(get_db),
) -> SearchResponse:
    response.headers["Cache-Control"] = "no-store"
    query = q.strip()
    if len(query) < 2:
        return SearchResponse(items=[])
    # Bound parameters and escaped LIKE wildcards: '%' and '_' are literal text.
    pattern = "%" + query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"

    def matches(*columns):
        return or_(*(column.ilike(pattern, escape="\\") for column in columns))

    admin = user.role == "administrator"
    property_scope = Property.created_by_user_id == user.id if admin else Property.submitters.any(Submitter.user_id == user.id)
    submitter_scope = Property.created_by_user_id == user.id if admin else Submitter.user_id == user.id
    bill_scope = Bill.created_by_user_id == user.id if admin else (Bill.submitter.has(Submitter.user_id == user.id) & (Bill.status != "void"))

    properties = db.execute(select(Property.id, Property.name, Property.unit, Property.place)
        .where(property_scope, matches(Property.name, Property.unit, Property.place))
        .order_by(Property.name, Property.id).limit(PER_GROUP_LIMIT)).all()
    submitters = db.execute(select(Submitter.id, Submitter.name, Submitter.property_id, Property.name.label("property_name"), User.email)
        .join(Property, Property.id == Submitter.property_id)
        .outerjoin(User, User.id == Submitter.user_id)
        .where(submitter_scope, matches(Submitter.name, User.name, User.email))
        .order_by(Submitter.name, Submitter.id).limit(PER_GROUP_LIMIT)).all()
    invoices = db.execute(select(Bill.id, Bill.bill_number, Bill.recipient_label, Bill.total_amount, Bill.due_date)
        .where(bill_scope, matches(Bill.bill_number, Bill.recipient_label, Bill.property_label, Bill.unit_label))
        .order_by(Bill.created_at.desc(), Bill.id.desc()).limit(PER_GROUP_LIMIT)).all()
    return SearchResponse(items=[
        *[SearchResult(kind="property", id=p.id, title=p.name, secondary=f"{p.unit} · {p.place}", property_id=p.id) for p in properties],
        *[SearchResult(kind="submitter", id=s.id, title=s.name, secondary=f"{s.property_name} · {s.email or 'No linked account'}", property_id=s.property_id) for s in submitters],
        *[SearchResult(kind="invoice", id=b.id, title=b.bill_number, secondary=f"{b.recipient_label} · INR {b.total_amount:,.2f} · Due {b.due_date}") for b in invoices],
    ])
