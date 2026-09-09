import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.dependencies import (
    require_administrator_csrf,
    require_operational_user,
)
from app.core.audit import security_event
from app.core.rate_limit import rate_limit
from app.database.connection import get_db
from app.models.bill import Bill, BillingRun
from app.models.meter_reading import MeterReading
from app.models.property import Property, Submitter
from app.models.user import User
from app.schemas.settings import TariffSettings, WorkspaceResetResponse
from app.services.settings_service import (
    default_tariff_settings,
    get_tariff_settings,
    save_tariff_settings,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get(
    "/settings",
    response_model=TariffSettings,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_operational_user)],
)
def get_settings(db: Session = Depends(get_db)):
    try:
        return get_tariff_settings(db)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unable to read tariff settings")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error") from exc


@router.put(
    "/settings",
    response_model=TariffSettings,
    status_code=status.HTTP_200_OK,
)
def update_settings(
    payload: TariffSettings,
    request: Request,
    current_admin: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
):
    try:
        saved = save_tariff_settings(
            db,
            payload,
            created_by_user_id=current_admin.id,
        )
        db.commit()
        security_event("tariff_changed", request=request, user_id=current_admin.id)
        return saved
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Unable to save tariff settings")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error") from exc


@router.post(
    "/reset",
    response_model=TariffSettings,
    status_code=status.HTTP_200_OK,
)
def reset_settings(
    request: Request,
    current_admin: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
):
    """Reset tariff settings to system defaults."""
    try:
        saved = save_tariff_settings(
            db,
            default_tariff_settings(),
            created_by_user_id=current_admin.id,
            name="System defaults",
        )
        db.commit()
        security_event("tariff_reset", request=request, user_id=current_admin.id)
        return saved
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        logger.exception("Unable to reset tariff settings")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unexpected error") from exc


@router.post(
    "/reset-workspace",
    response_model=WorkspaceResetResponse,
    status_code=status.HTTP_200_OK,
)
def reset_workspace(
    current_admin: User = Depends(require_administrator_csrf),
    db: Session = Depends(get_db),
):
    """Remove business workspace records while preserving accounts and sessions."""
    try:
        counts = {
            "properties_cleared": db.scalar(select(func.count(Property.id))) or 0,
            "submitters_cleared": db.scalar(select(func.count(Submitter.id))) or 0,
            "meter_readings_cleared": db.scalar(select(func.count(MeterReading.id))) or 0,
            "bills_cleared": db.scalar(select(func.count(Bill.id))) or 0,
            "billing_runs_cleared": db.scalar(select(func.count(BillingRun.id))) or 0,
        }

        db.execute(delete(Bill))
        db.execute(delete(BillingRun))
        db.execute(delete(MeterReading))
        db.execute(delete(Property))
        db.flush()

        save_tariff_settings(
            db,
            default_tariff_settings(),
            created_by_user_id=current_admin.id,
            name="System defaults",
        )
        db.commit()
        return WorkspaceResetResponse(**counts, tariff_defaults_restored=True)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to reset workspace") from exc
