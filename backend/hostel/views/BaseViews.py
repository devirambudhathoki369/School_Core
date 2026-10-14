"""The hostel module's access gate, and the small helpers every hostel view uses.

WHY A GATE AT ALL
-----------------
The hostel module is sold per school. Hiding the menu is not access control —
`configs/views/admin.jsx` hands every school admin the whole view map, so a page
that is merely un-listed is still reachable by typing its hash, and every one of
these endpoints would then answer normally. The refusal has to live where the
data is, which is here.

Two independent things are checked, in this order:

  1. THE TENANT BOUNDARY — does this account belong to the school it is asking
     about?  Already enforced for us by
     `account.auth.Authentication.belongs_to_school`, which runs during
     authentication for every admin/staff token that carries a `?school=`. We
     do not repeat it; we rely on it, and on passing the school id in the place
     that authenticator looks (`school` / `school_id`, query param or body).

  2. THE MODULE GATE — has the superadmin switched the hostel on for that
     school?  `SchoolAdmin.uses_hostel`.

A superadmin token skips (2), because the superadmin is who grants it and has to
be able to see what they granted.

The answer for a school without the module is 403 with a plain message. Not 404:
pretending the module does not exist would make "we bought hostel and it doesn't
work" indistinguishable from a broken deployment, and the school is allowed to
know the feature is off.
"""

from django.core.cache import cache
from rest_framework import status
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from main.models.SchoolAdmin import SchoolAdmin
from main.views.BaseViews import SecuredAPIView

HOSTEL_AUTH = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)

# The flag changes about once in a school's lifetime but is read on every single
# hostel request, so it is cached. Short TTL rather than explicit invalidation
# from the superadmin view: five minutes is a tolerable wait for a switch that
# is flipped once, and a stale cache that expires on its own can never get stuck
# the way a missed invalidation can.
_GATE_CACHE_TTL = 300


def school_has_hostel(school_id):
    try:
        school_id = int(school_id)
    except (TypeError, ValueError):
        return False
    key = f"hostel-module:{school_id}"
    allowed = cache.get(key)
    if allowed is None:
        allowed = SchoolAdmin.objects.filter(
            id=school_id, is_active=True, uses_hostel=True
        ).exists()
        cache.set(key, allowed, _GATE_CACHE_TTL)
    return bool(allowed)


def clear_hostel_gate_cache(school_id):
    """Called by the superadmin view so a school it just switched on does not
    have to wait out the TTL."""
    cache.delete(f"hostel-module:{school_id}")


class HostelBaseView(SecuredAPIView):
    """Every hostel endpoint inherits this. Nothing here is optional."""

    authentication_classes = HOSTEL_AUTH

    RESPONSE__MODULE_OFF = Response(
        {
            "message": "The hostel module is not enabled for this school. "
            "Ask your provider to switch it on."
        },
        status=status.HTTP_403_FORBIDDEN,
    )

    def school_id(self, request):
        """The school this request is about.

        Read from the SAME places the authenticator's `get_school` reads, so the
        id the tenant boundary validated is the id we then filter on. Reading it
        from anywhere else would re-open the hole that check exists to close.
        """
        params = request.query_params
        data = request.data if isinstance(request.data, dict) else {}
        return (
            params.get("school")
            or params.get("school_id")
            or data.get("school")
            or data.get("school_id")
        )

    # --- the gate ------------------------------------------------------------

    def gate(self, request):
        """Call FIRST in every handler:

            denied = self.gate(request)
            if denied:
                return denied

        Returns a response to send back, or None to carry on. Written as an
        explicit call rather than a `dispatch` override so that every handler
        shows, on its own first line, that it is gated — a decorator or a
        middleware is exactly the kind of protection someone later adds an
        endpoint without.
        """
        if getattr(request, "user_role", None) == UserRoles.ROLE_SUPERADMIN:
            return None
        school_id = self.school_id(request)
        if not school_id:
            # No school on the request means the tenant boundary in the
            # authenticator never ran either — refuse rather than guess one.
            return self.RESPONSE__INVALID_REQUEST
        if not school_has_hostel(school_id):
            return self.RESPONSE__MODULE_OFF
        return None

    # --- small shared helpers ------------------------------------------------

    def int_or_none(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def decimal_or_zero(self, value):
        from decimal import Decimal, InvalidOperation

        try:
            return Decimal(str(value or 0))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal(0)
