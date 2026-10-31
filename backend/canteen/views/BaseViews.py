"""The canteen module's access gate, and the helpers every view here uses.

WHY A GATE
----------
Like the hostel and extra billing, the canteen is granted per school by the
superadmin (its `canteen` row in main.SchoolModule). Hiding the menu is decoration — a
school admin is handed the whole view map, so an unlisted page is still one
typed URL away. The refusal has to live where the data is, which is here.

Three things are checked, in this order:

  1. THE TENANT BOUNDARY — does this account belong to the school it is asking
     about? Enforced during authentication by
     `account.auth.Authentication.belongs_to_school`, which is why the school id
     is read below from exactly the places that authenticator reads.
  2. THE MODULE GATE — has the superadmin switched this module on for them?
  3. THE PAGE — a member of staff or a canteen user needs the canteen page the
     request belongs to (`pages_for` below). A school admin holds them all.

A superadmin token skips (2) and (3): they are who grants it.

Refusal is 403 with a plain message, not 404: "we were given it and it doesn't
work" has to be distinguishable from a broken deployment.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from rest_framework import status
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from main.methods.nepaliDatetime import ndt_today
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff
from main.views.BaseViews import SecuredAPIView

from ..auth import CanteenUserTokenAuthentication
from ..constants import PAGES
from ..methods.gate import school_has_canteen
from ..methods.users import clean_pages

CANTEEN_AUTH = (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    CanteenUserTokenAuthentication,
    SuperAdminTokenAuthentication,
)

# The roles whose pages are counted. A school admin holds every page.
PAGE_HOLDERS = (UserRoles.ROLE_STAFF, UserRoles.ROLE_CANTEEN)


class CanteenBaseView(SecuredAPIView):
    """Every endpoint in this app inherits this. Nothing here is optional."""

    authentication_classes = CANTEEN_AUTH

    # Which canteen pages may make each call: {"POST": (page, ...)} — any ONE of
    # them will do. A method left out is refused to anyone who holds pages, so a
    # new handler starts closed. Reads list every page whose screen makes them:
    # the counter reads the items, Collect reads an account.
    pages_for = {}

    RESPONSE__MODULE_OFF = Response(
        {
            "message": "The canteen is not enabled for this school. "
            "Ask your provider to switch it on."
        },
        status=status.HTTP_403_FORBIDDEN,
    )
    RESPONSE__NO_PAGE = Response(
        {"message": "You do not have this canteen page. Ask the school's office for it."},
        status=status.HTTP_403_FORBIDDEN,
    )

    def perform_authentication(self, request):
        super().perform_authentication(request)
        # A canteen user belongs to exactly one school. Saying so here holds
        # the student, staff and class ids they name to it, the same check a
        # member of staff gets (SecuredAPIView.enforce_named_records_scope,
        # which reads main.views.BaseViews.caller_school_ids).
        if getattr(request, "user_role", None) == UserRoles.ROLE_CANTEEN:
            request._caller_school_ids = {request.user.school_id}

    def school_id(self, request):
        """The school this request is about — read from the SAME places the
        authenticator's `get_school` reads, so the id the tenant boundary
        validated is the id we then filter on."""
        params = request.query_params
        try:
            data = request.data if isinstance(request.data, dict) else {}
        except Exception:
            # A DELETE with an odd content-type makes DRF raise while parsing a
            # body we do not want. The school id is on the query string then.
            data = {}
        value = (
            params.get("school")
            or params.get("school_id")
            or data.get("school")
            or data.get("school_id")
        )
        return self.int_or_none(value)

    def gate(self, request):
        """Call FIRST in every handler:

            denied = self.gate(request)
            if denied:
                return denied

        An explicit call rather than a `dispatch` override, so every handler
        shows on its first line that it is gated.
        """
        if getattr(request, "user_role", None) == UserRoles.ROLE_SUPERADMIN:
            return None
        school_id = self.school_id(request)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        if not school_has_canteen(school_id):
            return self.RESPONSE__MODULE_OFF
        if getattr(request, "user_role", None) in PAGE_HOLDERS:
            method = "GET" if request.method == "HEAD" else request.method
            wanted = self.pages_for.get(method, ())
            if not set(wanted) & set(self.pages_held(request, school_id)):
                return self.RESPONSE__NO_PAGE
        return None

    def pages_held(self, request, school_id):
        """The canteen pages the signed-in person holds. Every page for a school
        admin or the superadmin; read fresh on each request for the rest, so a
        page taken away is refused at once, not at their next sign-in."""
        role = getattr(request, "user_role", None)
        if role == UserRoles.ROLE_CANTEEN:
            return clean_pages(request.user.permissions)
        if role == UserRoles.ROLE_STAFF:
            held = (
                Staff.objects.filter(account_id=request.user.pk, school_id=school_id)
                .values_list("permissions", flat=True)
                .first()
            )
            return clean_pages(held or [])
        return list(PAGES)

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
        student payment path.
        """
        try:
            amount = Decimal(str(value if value not in (None, "") else 0))
        except (InvalidOperation, TypeError, ValueError):
            return Decimal("0.00")
        if not amount.is_finite():
            return Decimal("0.00")
        # Half up, the way money is rounded on paper (Decimal's default is
        # half-even, which would turn 12.345 into 12.34).
        return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    def bool_of(self, value, default=False):
        if value is None:
            return default
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in ("1", "true", "yes", "on")

    def text(self, value, most):
        value = (value or "").strip() if isinstance(value, str) else ""
        return value[:most] or None

    def today(self):
        return ndt_today()

    def bs_date(self, value):
        """A YYYY-MM-DD Nepali date from the client, or today."""
        value = (value or "").strip() if isinstance(value, str) else ""
        if len(value) == 10 and value[4] == "-" and value[7] == "-" and value.replace("-", "").isdigit():
            return value
        return self.today()

    def economic_year(self, request, school_id):
        """The fiscal year a sale or receipt belongs to: the one the client
        names when it is a real one, otherwise the school's own current year.
        Never guessed from today's date."""
        data = request.data if isinstance(request.data, dict) else {}
        given = self.int_or_none(data.get("economic_year")) or self.int_or_none(
            request.query_params.get("economic_year")
        )
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

    def entered_by(self, request):
        """Who is at the counter, as a slip should name them: the member of
        staff's or canteen user's own name, or "admin" for the school's login."""
        role = getattr(request, "user_role", None)
        if role == UserRoles.ROLE_STAFF:
            row = (
                Staff.objects.filter(account=request.user)
                .values_list("first_name", "middle_name", "last_name")
                .first()
            )
            if row:
                return " ".join(p.strip() for p in row if p and p.strip())[:80]
            return "staff"
        if role == UserRoles.ROLE_CANTEEN:
            return (request.user.full_name or "").strip()[:80] or "canteen"
        if role == UserRoles.ROLE_SUPERADMIN:
            return "superadmin"
        return "admin"
