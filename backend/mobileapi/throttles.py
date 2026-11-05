"""Rate limits of the mobile API: per network address before sign-in, per
session after, and per email address for sign-in codes."""
from hashlib import sha256

from django.core.cache import cache
from rest_framework import status
from rest_framework.throttling import SimpleRateThrottle

from .errors import MobileError


class _PerAddress(SimpleRateThrottle):
    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class SchoolLookupThrottle(_PerAddress):
    scope, rate = "mobile_school_lookup", "60/min"


class PasswordSignInThrottle(_PerAddress):
    scope, rate = "mobile_signin", "30/min"


class EmailCodeThrottle(_PerAddress):
    scope, rate = "mobile_email_code", "30/hour"


class CodeVerifyThrottle(_PerAddress):
    scope, rate = "mobile_code_verify", "30/min"


class FamilyCodeThrottle(_PerAddress):
    scope, rate = "mobile_family_code", "10/hour"


class RefreshThrottle(_PerAddress):
    scope, rate = "mobile_refresh", "60/min"


class SessionThrottle(SimpleRateThrottle):
    scope, rate = "mobile_session", "600/min"

    def get_cache_key(self, request, view):
        session = getattr(request, "auth", None)
        if session is None:
            return None
        return self.cache_format % {"scope": self.scope, "ident": str(session.pk)}


EMAIL_GAP_SECONDS = 60
EMAIL_PER_HOUR = 5


def reserve_email_send(email: str) -> None:
    """At most one code a minute and five an hour to one address.

    Counted for every address asked about, known or not, so a refusal here
    says nothing about whether the school has that email.
    """
    who = sha256(email.encode()).hexdigest()
    if not cache.add(f"mobile-email-gap:{who}", 1, EMAIL_GAP_SECONDS):
        raise MobileError(
            "too_soon", "Please wait a minute before asking for another code.", status.HTTP_429_TOO_MANY_REQUESTS
        )
    hour_key = f"mobile-email-hour:{who}"
    cache.add(hour_key, 0, 60 * 60)
    try:
        sent = cache.incr(hour_key)
    except ValueError:
        cache.set(hour_key, 1, 60 * 60)
        sent = 1
    if sent > EMAIL_PER_HOUR:
        raise MobileError(
            "too_many_codes", "Too many codes for this email. Please try again in an hour.",
            status.HTTP_429_TOO_MANY_REQUESTS,
        )
