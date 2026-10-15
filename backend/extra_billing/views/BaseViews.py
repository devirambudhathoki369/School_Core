"""The extra-billing module's access gate, and the helpers every view here uses.

WHY A GATE
----------
Like the hostel, this module is granted per school by the superadmin (its
`extra_billing` row in main.SchoolModule). Hiding the menu is decoration — a
school admin is handed the whole view map, so an unlisted page is still one
typed URL away. The refusal has to live where the data is, which is here.

Two things are checked, in this order:

  1. THE TENANT BOUNDARY — does this account belong to the school it is asking
     about? Enforced for us during authentication by
     `account.auth.Authentication.belongs_to_school`, which is why the school id
     is read below from exactly the places that authenticator reads.
  2. THE MODULE GATE — has the superadmin switched this module on for them?

A superadmin token skips (2): they are who grants it, and must be able to see
what they granted.

Refusal is 403 with a plain message, not 404. "We bought it and it doesn't work"
has to be distinguishable from a broken deployment.
"""

from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from main.methods.schoolModules import school_has_module
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.views.BaseViews import SecuredAPIView

EXTRA_BILLING_AUTH = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)

def school_has_extra_billing(school_id):
    # One lookup on SchoolModule's unique index -- no cache, so a switch by the
    # superadmin applies on the very next request (main/methods/schoolModules.py).
    return school_has_module(school_id, "extra_billing", active_school=True)


class ExtraBillingBaseView(SecuredAPIView):
    """Every endpoint in this app inherits this. Nothing here is optional."""

    authentication_classes = EXTRA_BILLING_AUTH

    RESPONSE__MODULE_OFF = Response(
        {
            "message": "Extra billing is not enabled for this school. "
            "Ask your provider to switch it on."
        },
        status=status.HTTP_403_FORBIDDEN,
    )

    def school_id(self, request):
        """The school this request is about.

        Read from the SAME places the authenticator's `get_school` reads, so the
        id the tenant boundary validated is the id we then filter on.
        """
        params = request.query_params
        try:
            data = request.data if isinstance(request.data, dict) else {}
        except Exception:
            # A DELETE carrying an odd content-type makes DRF raise while
            # parsing a body we do not even want. The school id is on the query
            # string for those, so an unparseable body must not turn a valid
            # request into a 415.
            data = {}
        return (
            params.get("school")
            or params.get("school_id")
            or data.get("school")
            or data.get("school_id")
        )

    def gate(self, request):
        """Call FIRST in every handler:

            denied = self.gate(request)
            if denied:
                return denied

        Written as an explicit call rather than a `dispatch` override so every
        handler shows on its own first line that it is gated — a decorator is
        exactly the kind of protection someone later adds an endpoint without.
        """
        if getattr(request, "user_role", None) == UserRoles.ROLE_SUPERADMIN:
            return None
        school_id = self.school_id(request)
        if not school_id:
            # No school on the request means the tenant boundary in the
            # authenticator never ran either — refuse rather than guess one.
            return self.RESPONSE__INVALID_REQUEST
        if not school_has_extra_billing(school_id):
            return self.RESPONSE__MODULE_OFF
        return None

    # --- small shared helpers ------------------------------------------------

    def int_or_none(self, value):
        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    def money(self, value):
        """Every amount that arrives from a client goes through this.

        JSON carries decimals as strings, and `"0" + "500"` is `"0500"`, not
        500 — that exact mistake once multiplied a receipt tenfold in the
        student payment path. Nothing in this app adds an amount it has not
        coerced first.
        """
        try:
            amount = Decimal(str(value if value not in (None, "") else 0))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("0.00")
        return amount.quantize(Decimal("0.01"))

    def economic_year(self, request, school_id):
        """The fiscal year a charge or receipt belongs to.

        The client may name one (it does when the office is working in a year
        other than the running one); otherwise the school's own current year is
        used. Never guessed from today's date — a school that has not rolled
        over yet would get a year it does not use.
        """
        given = self.int_or_none(
            (request.data or {}).get("economic_year")
            if isinstance(request.data, dict)
            else None
        ) or self.int_or_none(request.query_params.get("economic_year"))
        if given and EconomicYear.objects.filter(id=given, is_active=True).exists():
            return given
        school_ey = (
            SchoolAdmin.objects.filter(id=school_id)
            .values_list("economic_year_id", flat=True)
            .first()
        )
        if school_ey:
            return school_ey
        return (
            EconomicYear.objects.filter(is_active=True, closed=False)
            .order_by("-id")
            .values_list("id", flat=True)
            .first()
        )
