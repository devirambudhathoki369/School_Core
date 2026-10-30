"""SUPERADMIN: which schools have the canteen.

  GET /canteen/manage/access    every active school, with the flag and, for the
                                ones that are on, what they have
  PUT /canteen/manage/access    {"school": <id>, "uses_canteen": bool}

Same shape and reasoning as Hostel Access and Extra Billing Access: the module
is sold, so a school that could switch it on for itself has not been sold
anything.

Switching a school OFF never deletes anything. Items, sales and accounts stay
exactly where they are and come back untouched if it is switched on again. The
one thing that needs saying out loud before switching off is money HELD: what
families topped up and has not been spent is theirs, and the school can no
longer refund it through the canteen while the module is off. So the list
carries that figure, and the screen asks about it.
"""

from django.db.models import Count, Sum
from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from main.methods.nepaliDatetime import ndt_today
from main.methods.schoolModules import granted_modules, set_school_modules
from main.models.SchoolAdmin import SchoolAdmin
from main.views.BaseViews import SecuredAPIView

from ..methods.balances import live
from ..models import CanteenItem, CanteenSale, CanteenTransaction


def held_and_owing(school_ids):
    """{school id: (money held on accounts, money owed by accounts)}."""
    out = {}
    rows = (
        live(CanteenTransaction.objects.filter(school_id__in=school_ids))
        .values("school_id", "account_id")
        .annotate(balance=Sum("amount"))
    )
    for row in rows:
        held, owing = out.get(row["school_id"], (0, 0))
        bal = row["balance"] or 0
        if bal > 0:
            held += bal
        elif bal < 0:
            owing -= bal
        out[row["school_id"]] = (held, owing)
    return out


class ManageCanteenAccessView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        schools = list(
            SchoolAdmin.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name", "address")
        )
        ids = [s["id"] for s in schools]
        granted = granted_modules(ids)
        for school in schools:
            school["uses_canteen"] = "canteen" in granted[school["id"]]
        items = {
            r["school_id"]: r["n"]
            for r in CanteenItem.objects.filter(school_id__in=ids, is_active=True)
            .values("school_id")
            .annotate(n=Count("id"))
        }
        month = ndt_today()[:7]
        sales = {
            r["school_id"]: (r["n"], r["total"])
            for r in CanteenSale.objects.filter(
                school_id__in=ids, is_active=True, date__startswith=month
            )
            .values("school_id")
            .annotate(n=Count("id"), total=Sum("total"))
        }
        money = held_and_owing(ids)
        for school in schools:
            school["items"] = items.get(school["id"], 0)
            n, total = sales.get(school["id"], (0, 0))
            school["sales_this_month"] = n
            school["sales_amount_this_month"] = total or 0
            held, owing = money.get(school["id"], (0, 0))
            school["held"] = held
            school["owing"] = owing
        return Response(
            {
                "schools": schools,
                "enabled": sum(1 for s in schools if s["uses_canteen"]),
                "total": len(schools),
            }
        )

    def put(self, request):
        school_id = request.data.get("school")
        value = request.data.get("uses_canteen")
        if not school_id or not isinstance(value, bool):
            return self.RESPONSE__INVALID_REQUEST
        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            return self.RESPONSE__NOT_FOUND
        # The school's `canteen` grant (main.SchoolModule) -- the same switch as
        # the Facilities group on the school form, so either place shows it.
        set_school_modules(school, {"canteen": value})

        if value:
            message = "Canteen enabled. The school sees it on their next sign-in."
        else:
            held, _ = held_and_owing([school.id]).get(school.id, (0, 0))
            message = "Canteen disabled. Nothing was deleted"
            message += (
                f"; Rs. {held:,.2f} of families' top-ups is still held on accounts and "
                "returns with everything else if it is switched back on."
                if held
                else "."
            )
        return Response(
            {"school": school.id, "uses_canteen": value, "message": message}
        )
