"""Bound public authentication traffic as well as per-account failures."""
from django.core.cache import cache
from rest_framework.exceptions import Throttled
from rest_framework.throttling import SimpleRateThrottle


class AuthIPThrottle(SimpleRateThrottle):
    scope = "authentication_ip"
    rate = "120/min"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class RegistrationIPThrottle(AuthIPThrottle):
    scope = "registration_ip"
    rate = "10/hour"


class AnonymousIPThrottle(SimpleRateThrottle):
    """Requests with nobody signed in, per client address. Every API view
    that names no rate limit of its own gets this and the per-user one below
    (REST_FRAMEWORK's defaults in settings), so a view added later is never
    left without a limit. Generous: a school's office shares one address."""

    scope = "anonymous_ip"
    rate = "300/min"

    def get_cache_key(self, request, view):
        user = getattr(request, "user", None)
        if user is not None and user.is_authenticated:
            return None
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class AuthenticatedUserThrottle(SimpleRateThrottle):
    scope = "school_api_user"
    rate = "600/min"

    def get_cache_key(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return None
        ident = f"{user._meta.label_lower}:{user.pk}"
        return self.cache_format % {"scope": self.scope, "ident": ident}


def reserve_otp_send(student_id):
    # The target student, not a client-chosen username: changing the username
    # must not buy another SMS or bypass the resend interval.
    if not cache.add(f"otp-send:student:{student_id}", True, 60):
        raise Throttled(wait=60, detail="Please wait before requesting another code.")


def client_address(request) -> str:
    """The caller's address as the rate limits count it (NUM_PROXIES aware)."""
    return AuthIPThrottle().get_ident(request)


class FailureCounter:
    """Failed attempts of one kind from one key, in a rolling window: a
    wrong reader key, a wrong admin password. `blocked` once `limit` is
    reached; a success may `clear` it."""

    def __init__(self, kind: str, limit: int, seconds: int):
        self.kind, self.limit, self.seconds = kind, limit, seconds

    def _key(self, who: str) -> str:
        from hashlib import sha256

        return f"fail:{self.kind}:" + sha256(who.encode()).hexdigest()

    def blocked(self, who: str) -> bool:
        return (cache.get(self._key(who)) or 0) >= self.limit

    def record(self, who: str) -> None:
        key = self._key(who)
        cache.add(key, 0, self.seconds)
        try:
            cache.incr(key)
        except ValueError:  # expired between add and incr
            cache.set(key, 1, self.seconds)

    def clear(self, who: str) -> None:
        cache.delete(self._key(who))
