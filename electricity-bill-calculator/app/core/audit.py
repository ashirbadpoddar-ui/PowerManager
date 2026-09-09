"""Small safe audit-log helper for security-relevant application events."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from fastapi import Request

logger = logging.getLogger("powermanage.security")


def security_event(
    event: str,
    *,
    request: Request | None = None,
    user_id: int | None = None,
    outcome: str = "success",
    resource_id: int | None = None,
) -> None:
    """Log identifiers and outcomes only; never pass credentials or payloads."""

    request_id = getattr(getattr(request, "state", None), "request_id", "-")
    path = getattr(getattr(request, "url", None), "path", "-")
    logger.info(
        "security_event event=%s outcome=%s user_id=%s resource_id=%s request_id=%s path=%s",
        event,
        outcome,
        user_id if user_id is not None else "-",
        resource_id if resource_id is not None else "-",
        request_id,
        path,
    )
