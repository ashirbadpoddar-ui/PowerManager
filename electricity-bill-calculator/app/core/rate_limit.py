"""Process-local rate-limit integration point for sensitive endpoints.

The limiter is intentionally enabled only for staging/production configuration.
For multiple workers or multiple instances, deploy a shared Redis/API-gateway
limiter; this in-memory layer is a useful local safety net, not a distributed
coordination mechanism.
"""

from __future__ import annotations

import threading
import time
from collections.abc import Callable

from fastapi import HTTPException, Request, status

from app.core.config import settings

_lock = threading.RLock()
_buckets: dict[tuple[str, str], tuple[float, int]] = {}


def _client_key(request: Request) -> str:
    # Do not trust spoofable X-Forwarded-For headers here. Configure the
    # reverse proxy to enforce its own client-IP policy in production.
    return request.client.host if request.client is not None else "unknown"


def enforce_rate_limit(request: Request, bucket: str, limit: int, window_seconds: int = 60) -> None:
    if not settings.rate_limit_enabled:
        return

    now = time.monotonic()
    key = (bucket, _client_key(request))
    with _lock:
        started, count = _buckets.get(key, (now, 0))
        if now - started >= window_seconds:
            started, count = now, 0
        if count >= limit:
            retry_after = max(1, int(window_seconds - (now - started)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )
        _buckets[key] = (started, count + 1)


def rate_limit(bucket: str, limit: int, window_seconds: int = 60) -> Callable:
    def dependency(request: Request) -> None:
        enforce_rate_limit(request, bucket, limit, window_seconds)

    return dependency
