"""SUPERADMIN: which schools may bill people who are not students.

  GET /extra-billing/manage/access    every active school, with the flag and,
                                      for the ones that are on, what they have
  PUT /extra-billing/manage/access    {"school": <id>, "uses_extra_billing": bool}

Same shape and same reasoning as Hostel Access and Library Access: the module is
sold, so a school that could switch it on for itself has not been sold anything.

Switching a school OFF never deletes anything. Their parties, bills and receipts
stay exactly where they are and come back untouched if it is switched on again —
a lapsed renewal must not destroy a year of rent records. Off means "cannot be
reached", not "did not happen".
"""

from django.db.models import Count
from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from main.models.SchoolAdmin import SchoolAdmin
from main.views.BaseViews import SecuredAPIView

from ..models.Billing import ExtraInvoice
from ..models.Party import BillingParty
from .BaseViews import clear_extra_billing_gate_cache


class ManageExtraBillingAccessView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        schools = list(
            SchoolAdmin.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name", "address", "uses_extra_billing")
        )
        enabled_ids = [s["id"] for s in schools if s["uses_extra_billing"]]
        parties = {
            r["school_id"]: r["n"]
            for r in BillingParty.objects.filter(
                school_id__in=enabled_ids, is_active=True
            )
            .values("school_id")
            .annotate(n=Count("id"))
        }
        receipts = {
            r["school_id"]: r["n"]
            for r in ExtraInvoice.objects.filter(
                school_id__in=enabled_ids, is_active=True
            )
            .values("school_id")
            .annotate(n=Count("id"))
        }
        for school in schools:
            school["parties"] = parties.get(school["id"], 0)
            school["receipts"] = receipts.get(school["id"], 0)
        return Response(
            {
                "schools": schools,
                "enabled": len(enabled_ids),
                "total": len(schools),
            }
        )

    def put(self, request):
        school_id = request.data.get("school")
        value = request.data.get("uses_extra_billing")
        if not school_id or not isinstance(value, bool):
            return self.RESPONSE__INVALID_REQUEST
        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            return self.RESPONSE__NOT_FOUND
        school.uses_extra_billing = value
        school.save(update_fields=["uses_extra_billing"])
        # The gate caches this for five minutes; drop the entry so the school
        # sees the change on their next sign-in rather than five minutes later.
        clear_extra_billing_gate_cache(school.id)

        kept = None
        if not value:
            kept = BillingParty.objects.filter(
                school_id=school.id, is_active=True
            ).count()
        return Response(
            {
                "school": school.id,
                "uses_extra_billing": school.uses_extra_billing,
                "message": (
                    "Extra billing enabled. The school sees it on their next sign-in."
                    if value
                    else (
                        "Extra billing disabled. "
                        + (
                            f"{kept} party record(s) kept and will return if it is switched back on."
                            if kept
                            else "Nothing was deleted."
                        )
                    )
                ),
            }
        )
