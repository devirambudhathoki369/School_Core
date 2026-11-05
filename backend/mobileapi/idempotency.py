"""Idempotency keys for the mobile API's writes (mobile/SPEC.md §5).

The app sends `Idempotency-Key: <uuid>` with every write and keeps the same
key when it retries, including from the offline queue hours later. The first
successful answer is kept for 24 hours and given again to any repeat, so a
double tap or a retry after a dropped connection never saves twice. A repeat
that arrives while the first is still running is told to wait (409). A
failed write keeps nothing, so the same key can be tried again.

Keys are per account, so two people can never collide on one.
"""
import functools
import re

from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response

from .errors import MobileError

WINDOW_SECONDS = 24 * 60 * 60
RUNNING_SECONDS = 120
_RUNNING = "__running__"
_KEY = re.compile(r"^[A-Za-z0-9_-]{8,100}$")


def _cache_key(request, key: str) -> str:
    session = request.auth
    return f"mobile:idem:{session.role}:{session.account.pk}:{request.method}:{request.path}:{key}"


def idempotent(handler):
    @functools.wraps(handler)
    def wrapper(view, request, *args, **kwargs):
        key = request.headers.get("Idempotency-Key", "").strip()
        if not _KEY.match(key):
            raise MobileError(
                "idempotency_key_required",
                "This request needs an Idempotency-Key header of 8 to 100 letters, digits, - or _.",
            )
        cache_key = _cache_key(request, key)
        if not cache.add(cache_key, _RUNNING, RUNNING_SECONDS):
            kept = cache.get(cache_key)
            if kept == _RUNNING or kept is None:
                raise MobileError(
                    "in_progress", "This is still being saved. Try again in a moment.", status.HTTP_409_CONFLICT
                )
            response = Response(kept["data"], status=kept["status"])
            response["Idempotent-Replay"] = "true"
            return response
        try:
            response = handler(view, request, *args, **kwargs)
        except BaseException:
            cache.delete(cache_key)
            raise
        if 200 <= response.status_code < 300:
            cache.set(cache_key, {"status": response.status_code, "data": response.data}, WINDOW_SECONDS)
        else:
            cache.delete(cache_key)
        return response

    return wrapper
