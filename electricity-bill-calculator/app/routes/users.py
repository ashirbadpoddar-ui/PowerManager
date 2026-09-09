from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import require_administrator, require_administrator_csrf
from app.core.audit import security_event
from app.core.rate_limit import rate_limit
from app.core.security import hash_password
from app.database.connection import get_db
from app.models.user import User
from app.schemas.user import PasswordResetRequest, UserCreate, UserResponse, UserUpdate
from app.services.auth_service import clear_auth_cookies, revoke_user_sessions


router = APIRouter(prefix="/api/users", tags=["users"])

def _get_user_for_update(db: Session, user_id: int) -> User:
    user = db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.get("", response_model=list[UserResponse])
def list_users(
    _: User = Depends(require_administrator),
    db: Session = Depends(get_db),
) -> list[User]:
    return list(db.scalars(select(User).order_by(User.id)).all())


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    _: User = Depends(require_administrator),
    db: Session = Depends(get_db),
) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.post(
    "",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("admin-create-user", 20))],
)
def create_user(
    payload: UserCreate,
    _: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> User:
    user = User(
        name=payload.name,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
        must_change_password=True,
        failed_login_count=0,
    )
    try:
        db.add(user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email already exists",
        ) from exc
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    payload: UserUpdate,
    current_admin: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> User:
    user = _get_user_for_update(db, user_id)

    next_role = payload.role if payload.role is not None else user.role
    next_active = payload.is_active if payload.is_active is not None else user.is_active

    if user.id == current_admin.id and (next_role != "administrator" or not next_active):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrators cannot deactivate or demote themselves",
        )

    removes_active_administrator = (
        user.role == "administrator"
        and user.is_active
        and (next_role != "administrator" or not next_active)
    )
    if removes_active_administrator:
        active_admin_count = db.scalar(
            select(func.count(User.id)).where(
                User.role == "administrator",
                User.is_active.is_(True),
            )
        ) or 0
        if active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The final active administrator cannot be deactivated or demoted",
            )

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        user.email = str(payload.email)
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
        if not payload.is_active:
            revoke_user_sessions(db, user.id)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with that email already exists",
        ) from exc
    db.refresh(user)
    return user


@router.post(
    "/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(rate_limit("admin-reset-password", 20))],
)
def reset_password(
    user_id: int,
    payload: PasswordResetRequest,
    response: Response,
    current_admin: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
) -> None:
    user = _get_user_for_update(db, user_id)
    user.password_hash = hash_password(payload.password)
    user.must_change_password = True
    user.failed_login_count = 0
    user.locked_until = None
    revoke_user_sessions(db, user.id)
    db.commit()

    if user.id == current_admin.id:
        clear_auth_cookies(response)
    return None
