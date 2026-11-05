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
