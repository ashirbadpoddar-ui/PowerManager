"""Read document fields from the immutable invoice snapshot; never recalculate."""
from decimal import Decimal, InvalidOperation


def invoice_display_fields(snapshot: dict | None) -> dict:
    snapshot = snapshot or {}

    def number(key):
        value = snapshot.get(key)
        if value is None:
            return None
        try:
            result = Decimal(str(value))
            return result if result.is_finite() else None
        except (InvalidOperation, ValueError):
            return None

    rate = number("rate_per_unit")
    breakdown = snapshot.get("breakdown") or []
    mode = snapshot.get("rate_mode")
    if mode not in ("manual", "slab"):
        mode = "manual" if rate is not None else "slab" if breakdown else None
    return {
        "previous_reading": number("previous_reading"),
        "current_reading": number("current_reading"),
        "rate_per_unit": rate,
        "rate_mode": mode,
        "breakdown": breakdown,
        "meter_name": snapshot.get("meter_name"),
    }
