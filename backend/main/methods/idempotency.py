"""
Idempotency guard for write endpoints.

Prevents the same logical record from being stored twice when a client
double-submits — a double click, an impatient re-tap, or an automatic retry
after a slow response. A per-payload signature is reserved in the shared cache
(Redis in production, so the lock is honoured across every gunicorn worker) for
a short window; a second identical submission inside that window is treated as a
duplicate instead of creating another row.

Lifecycle for one save:
    key = make_signature(...)
    if not reserve(key):          # someone already submitted this within window
        cached = peek(key)        # -> stored payload, or PENDING if still saving
        ...return the original / ask the user to wait...
        ...unless the original was deleted since: reclaim(key, its id) and
           carry on to create the record...
    try:
        ...create the record...
        fill(key, {...}, ...)     # keep the lock for the full window + remember
                                  # what was created so a duplicate can echo it
    except Exception:
        release(key)              # creation failed -> allow an immediate retry
        raise
"""

import hashlib
import json

from django.core.cache import cache

# How long an identical submission is blocked after a successful save.
# The user asked that the same record not be storable again "till 1-2 minutes
# later"; 120s sits at the top of that range.
DUPLICATE_WINDOW_SECONDS = 120

# Placeholder value while the first request is still creating the record. A
# duplicate that sees this knows the original is in flight but not yet finished.
PENDING = "__pending__"


def make_signature(*parts) -> str:
    """Stable cache key derived from the identifying parts of a payload.

    Order matters and is preserved; values are JSON-encoded with sorted keys so
    dict ordering never changes the signature. Two byte-identical submissions
    (the double-submit case) always produce the same key.
    """
    raw = json.dumps(parts, sort_keys=True, default=str)
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    return f"dedup:{digest}"


def reserve(key: str, window: int = DUPLICATE_WINDOW_SECONDS) -> bool:
    """Atomically claim the key. True on the first caller, False for duplicates.

    Uses cache.add, which is atomic on Redis, so two truly-simultaneous requests
    hitting different workers can't both win the reservation.
    """
    return cache.add(key, PENDING, window)


def fill(key: str, value, window: int = DUPLICATE_WINDOW_SECONDS) -> None:
    """Keep the lock for the full window and remember what was created."""
    cache.set(key, value, window)


def reclaim(key: str, gone, window: int = DUPLICATE_WINDOW_SECONDS) -> bool:
    """Take over a key whose remembered record no longer stands. True for the
    one caller who gets it.

    A record deleted and entered again inside the window is not a double
    click: the first one is gone, so the second has nothing to duplicate and
    must be stored. `gone` is the id the key remembered. Only one caller can
    follow on from that record, so two re-entries arriving together still
    store one row; the other is told to wait, like any duplicate of a save in
    flight.
    """
    if not cache.add(f"{key}:after:{gone}", 1, window):
        return False
    cache.set(key, PENDING, window)
    return True


def release(key: str) -> None:
    """Drop the lock so a legitimate retry can proceed (creation failed)."""
    cache.delete(key)


def peek(key: str):
    """Current cached value for the key: PENDING, a stored payload, or None."""
    return cache.get(key)
