from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import generate_token, hash_token
from app.models.session import UserSession
from app.models.user import User

SESSION_COOKIE_NAME = "powermanage_session"
CSRF_COOKIE_NAME = "powermanage_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"


@dataclass(frozen=True)
class SessionCredentials:
    session_token: str
    csrf_token: str
    expires_at: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def create_user_session(db: Session, user: User) -> SessionCredentials:
    now = utc_now()
    db.execute(delete(UserSession).where(UserSession.expires_at <= now))

    session_token = generate_token()
    csrf_token = generate_token()
    expires_at = now + timedelta(hours=settings.session_ttl_hours)
    db.add(
        UserSession(
            token_hash=hash_token(session_token),
            csrf_token_hash=hash_token(csrf_token),
            user_id=user.id,
            created_at=now,
            expires_at=expires_at,
        )
    )
    return SessionCredentials(
        session_token=session_token,
        csrf_token=csrf_token,
        expires_at=expires_at,
    )


def revoke_user_sessions(db: Session, user_id: int) -> None:
    db.execute(delete(UserSession).where(UserSession.user_id == user_id))


def set_auth_cookies(response: Response, credentials: SessionCredentials) -> None:
    response.headers[CSRF_HEADER_NAME] = credentials.csrf_token
    max_age = settings.session_ttl_hours * 60 * 60
    common = {
        "max_age": max_age,
        "expires": credentials.expires_at,
        "path": "/",
        "secure": settings.session_cookie_secure,
        "samesite": settings.effective_session_cookie_samesite,
    }
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=credentials.session_token,
        httponly=True,
        **common,
    )
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=credentials.csrf_token,
        httponly=False,
        **common,
    )


def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=True,
        samesite=settings.effective_session_cookie_samesite,
    )
    response.delete_cookie(
        key=CSRF_COOKIE_NAME,
        path="/",
        secure=settings.session_cookie_secure,
        httponly=False,
        samesite=settings.effective_session_cookie_samesite,
    )
