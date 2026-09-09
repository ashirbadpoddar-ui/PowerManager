from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session, joinedload

from app.core.security import hash_token, tokens_match
from app.database.connection import get_db
from app.models.session import UserSession
from app.models.user import User
from app.services.auth_service import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    SESSION_COOKIE_NAME,
)


@dataclass(frozen=True)
class AuthContext:
    user: User
    session: UserSession


ADMIN_MUTATION_LOCK_KEY = 2_854_309_959_552_149_977


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def get_auth_context(
    request: Request,
    db: Session = Depends(get_db),
) -> AuthContext:
    raw_token = request.cookies.get(SESSION_COOKIE_NAME)
    if not raw_token:
        raise _unauthorized()

    user_session = db.scalar(
        select(UserSession)
        .options(joinedload(UserSession.user))
        .where(UserSession.token_hash == hash_token(raw_token))
    )
    if user_session is None:
        raise _unauthorized()

    now = datetime.now(timezone.utc)
    if _as_utc(user_session.expires_at) <= now:
        db.delete(user_session)
        db.commit()
        raise _unauthorized()

    if not user_session.user.is_active:
        db.execute(delete(UserSession).where(UserSession.user_id == user_session.user_id))
        db.commit()
        raise _unauthorized()

    return AuthContext(user=user_session.user, session=user_session)


def get_current_user(context: AuthContext = Depends(get_auth_context)) -> User:
    return context.user


def require_csrf(
    request: Request,
    context: AuthContext = Depends(get_auth_context),
) -> User:
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    header_token = request.headers.get(CSRF_HEADER_NAME)
    if (
        not cookie_token
        or not header_token
        or not tokens_match(cookie_token, header_token)
        or not tokens_match(hash_token(header_token), context.session.csrf_token_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF validation failed",
        )
    return context.user


def require_operational_user(user: User = Depends(get_current_user)) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    return user


def require_operational_csrf_user(user: User = Depends(require_csrf)) -> User:
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    return user


def require_administrator(user: User = Depends(require_operational_user)) -> User:
    if user.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return user


def require_administrator_csrf(
    user: User = Depends(require_operational_csrf_user),
    context: AuthContext = Depends(get_auth_context),
    db: Session = Depends(get_db),
) -> User:
    if user.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )

    # Serialize privileged mutations with role/status changes, then re-read
    # authorization and session state after the lock. This closes the window in
    # which an in-flight request could act after another administrator demoted,
    # deactivated, or reset the caller.
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ADMIN_MUTATION_LOCK_KEY})
    current_user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    session_still_exists = db.scalar(
        select(UserSession.id).where(UserSession.id == context.session.id)
    ) is not None

    if current_user is None or not current_user.is_active or not session_still_exists:
        raise _unauthorized()
    if current_user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Password change required",
        )
    if current_user.role != "administrator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator access required",
        )
    return current_user
