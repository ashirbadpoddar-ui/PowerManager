from fastapi import APIRouter, Depends

from app.schemas.electricity import (
    BillCalculationRequest,
    BillCalculationResponse,
    DetailedBillRequest,
    DetailedBillResponse,
    SimpleBillRequest,
    SimpleBillResponse,
)

from app.services.bill_calculator import (
    calculate_bill,
    calculate_detailed_bill,
    calculate_meter_bill,
    calculate_simple_bill,
)
from app.api.dependencies import require_operational_csrf_user


router = APIRouter(
    tags=["Electricity"],
)


@router.post("/calculate", response_model=BillCalculationResponse)
def calculate(
    request: BillCalculationRequest,
    _user=Depends(require_operational_csrf_user),
):
    return calculate_bill(request)


@router.post("/calculate-detailed", response_model=DetailedBillResponse)
def calculate_detailed(
    request: DetailedBillRequest,
    _user=Depends(require_operational_csrf_user),
):
    return calculate_detailed_bill(request)


@router.post(
    "/simple-calculate",
    response_model=SimpleBillResponse,
)
def simple_calculate(
    request: SimpleBillRequest,
    _user=Depends(require_operational_csrf_user),
):
    return calculate_meter_bill(request)
