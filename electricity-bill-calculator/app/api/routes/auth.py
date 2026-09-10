from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_auth_context, require_csrf
from app.api.dependencies import AuthContext
from app.core.config import settings
from app.core.audit import security_event
from app.core.rate_limit import rate_limit
from app.core.security import (
    DUMMY_PASSWORD_HASH,
    hash_token,
    hash_password,
    password_hash_needs_rehash,
    tokens_match,
    verify_password,
)
from app.database.connection import get_db
from app.models.session import UserSession
from app.models.user import User
from app.schemas.user import (
    BootstrapRequest,
    BootstrapStatusResponse,
    ChangePasswordRequest,
    LoginRequest,
    ProfileUpdate,
    UserResponse,
)
from app.services.auth_service import (
    CSRF_COOKIE_NAME,
    CSRF_HEADER_NAME,
    clear_auth_cookies,
    create_user_session,
    revoke_user_sessions,
    set_auth_cookies,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])

BOOTSTRAP_LOCK_KEY = 5_237_205_609_357_661_282
MAX_FAILED_LOGINS = 5
LOCKOUT_MINUTES = 15


def _invalid_credentials() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid email or password",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _lock_authenticated_user(
    db: Session,
    context: AuthContext,
) -> User:
    user = db.scalar(
        select(User)
        .where(User.id == context.user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    session_still_exists = db.scalar(
        select(UserSession.id).where(UserSession.id == context.session.id)
    ) is not None
    if user is None or not user.is_active or not session_still_exists:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    return user


@router.get("/bootstrap-status", response_model=BootstrapStatusResponse)
def get_bootstrap_status(db: Session = Depends(get_db)) -> BootstrapStatusResponse:
    has_users = db.scalar(select(User.id).limit(1)) is not None
    return BootstrapStatusResponse(setup_required=not has_users)


@router.post(
    "/bootstrap",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("auth-bootstrap", 5))],
)
def bootstrap_administrator(
    payload: BootstrapRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    # A transaction-scoped PostgreSQL advisory lock makes the zero-user check
    # and insert a single serialized operation across all application workers.
    # Check completion before checking the token so an initialized deployment
    # cannot be used as an oracle for a stale bootstrap secret.
    db.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": BOOTSTRAP_LOCK_KEY})
    if (db.scalar(select(func.count(User.id))) or 0) != 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Initial setup has already been completed",
        )

    if settings.bootstrap_token is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Initial setup is not configured",
        )
    expected_token = settings.bootstrap_token.get_secret_value()
    if not tokens_match(payload.setup_token, expected_token):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid setup token",
        )

    user = User(
        name=payload.name,
        email=str(payload.email),
        password_hash=hash_password(payload.password),
        role="administrator",
        is_active=True,
        must_change_password=False,
        failed_login_count=0,
    )
    try:
        db.add(user)
        db.flush()
        credentials = create_user_session(db, user)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Initial setup could not be completed",
        ) from exc

    db.refresh(user)
    set_auth_cookies(response, credentials)
    security_event("bootstrap_completed", request=request, user_id=user.id)
    return user


@router.post(
    "/login",
    response_model=UserResponse,
    dependencies=[Depends(rate_limit("auth-login", 20))],
)
def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    user = db.scalar(
        select(User)
        .where(User.email == str(payload.email))
        .with_for_update()
    )
    if user is None:
        verify_password(DUMMY_PASSWORD_HASH, payload.password)
        raise _invalid_credentials()

    password_is_valid = verify_password(user.password_hash, payload.password)
    now = datetime.now(timezone.utc)

    if not user.is_active:
        raise _invalid_credentials()

    if user.locked_until is not None:
        locked_until = user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
            raise _invalid_credentials()
        user.locked_until = None
        user.failed_login_count = 0

    if not password_is_valid:
        user.failed_login_count += 1
        if user.failed_login_count >= MAX_FAILED_LOGINS:
            user.locked_until = now + timedelta(minutes=LOCKOUT_MINUTES)
        db.commit()
        raise _invalid_credentials()

    user.failed_login_count = 0
    user.locked_until = None
    if password_hash_needs_rehash(user.password_hash):
        user.password_hash = hash_password(payload.password)

    credentials = create_user_session(db, user)
    db.commit()
    db.refresh(user)
    set_auth_cookies(response, credentials)
    security_event("login_succeeded", request=request, user_id=user.id)
    return user


@router.get("/me", response_model=UserResponse)
def get_me(request: Request, response: Response, context: AuthContext = Depends(get_auth_context)) -> User:
    # Restore the CSRF token after reload without exposing the HttpOnly session.
    token = request.cookies.get(CSRF_COOKIE_NAME)
    if token and tokens_match(hash_token(token), context.session.csrf_token_hash):
        response.headers[CSRF_HEADER_NAME] = token
    return context.user


@router.patch("/me", response_model=UserResponse)
def update_me(
    payload: ProfileUpdate,
    context: AuthContext = Depends(get_auth_context),
    _: User = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> User:
    user = _lock_authenticated_user(db, context)
    next_email = str(payload.email) if payload.email is not None else user.email
    if next_email != user.email:
        if payload.current_password is None or not verify_password(
            user.password_hash, payload.current_password
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect",
            )
        user.email = next_email

    if payload.name is not None:
        user.name = payload.name

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
    "/change-password",
    response_model=UserResponse,
    dependencies=[Depends(rate_limit("auth-change-password", 10))],
)
def change_password(
    payload: ChangePasswordRequest,
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    _: User = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> User:
    user = _lock_authenticated_user(db, context)
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    user.failed_login_count = 0
    user.locked_until = None
    revoke_user_sessions(db, user.id)
    credentials = create_user_session(db, user)
    db.commit()
    db.refresh(user)
    set_auth_cookies(response, credentials)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    context: AuthContext = Depends(get_auth_context),
    _: User = Depends(require_csrf),
    db: Session = Depends(get_db),
) -> None:
    db.delete(context.session)
    db.commit()
    clear_auth_cookies(response)
    return None
