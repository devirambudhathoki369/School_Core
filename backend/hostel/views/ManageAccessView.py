"""SUPERADMIN: which schools have the hostel module.

  GET /hostel/manage/access          every active school, with a flag and,
                                     for the ones that are on, what they have
                                     built so far
  PUT /hostel/manage/access          {"school": <id>, "uses_hostel": true|false}

WHY THIS IS SUPERADMIN-ONLY, AND WHY IT IS A SEPARATE ENDPOINT
-------------------------------------------------------------
The module is sold. A school that could switch it on for itself is not a school
that has been sold anything — which is exactly the reasoning behind
`ManageLibraryGuestSchoolsView`, and this follows it deliberately rather than
inventing a second shape for the same decision.

Switching a school OFF never deletes anything. Their hostels, rooms and
allocation history stay exactly where they are, and come back untouched if the
module is switched on again — a billing dispute or a lapsed renewal must not
destroy a year of residency records. Off means "cannot be reached", not "did not
happen".
"""

from django.db.models import Count, Q
from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from main.models.SchoolAdmin import SchoolAdmin
from main.views.BaseViews import SecuredAPIView
from ..constants import ALLOC_ACTIVE
from ..models.Allocation import HostelAllocation
from ..models.Hostel import Hostel
from .BaseViews import clear_hostel_gate_cache


class ManageHostelAccessView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        schools = list(
            SchoolAdmin.objects.filter(is_active=True)
            .order_by("name")
            .values("id", "name", "address", "uses_hostel")
        )
        enabled_ids = [s["id"] for s in schools if s["uses_hostel"]]
        hostels = {
            r["school_id"]: r["n"]
            for r in Hostel.objects.filter(school_id__in=enabled_ids, is_active=True)
            .values("school_id")
            .annotate(n=Count("id"))
        }
        residents = {
            r["school_id"]: r["n"]
            for r in HostelAllocation.objects.filter(
                school_id__in=enabled_ids, status=ALLOC_ACTIVE, is_active=True
            )
            .values("school_id")
            .annotate(n=Count("id"))
        }
        for s in schools:
            s["hostels"] = hostels.get(s["id"], 0)
            s["residents"] = residents.get(s["id"], 0)
        return Response(
            {
                "schools": schools,
                "enabled": len(enabled_ids),
                "total": len(schools),
            }
        )

    def put(self, request):
        school_id = request.data.get("school")
        value = request.data.get("uses_hostel")
        if not school_id or not isinstance(value, bool):
            return self.RESPONSE__INVALID_REQUEST
        school = SchoolAdmin.objects.filter(id=school_id).first()
        if not school:
            return self.RESPONSE__NOT_FOUND
        school.uses_hostel = value
        school.save(update_fields=["uses_hostel"])
        # The gate caches this flag for five minutes; drop the entry so the
        # school sees the change on their next sign-in rather than five minutes
        # after it.
        clear_hostel_gate_cache(school.id)

        kept = None
        if not value:
            kept = HostelAllocation.objects.filter(
                school_id=school.id, status=ALLOC_ACTIVE, is_active=True
            ).count()
        return Response(
            {
                "school": school.id,
                "uses_hostel": school.uses_hostel,
                "message": (
                    "Hostel module enabled. The school sees it on their next sign-in."
                    if value
                    else (
                        "Hostel module disabled. "
                        + (
                            f"{kept} resident record(s) kept and will return if it is switched back on."
                            if kept
                            else "Nothing was deleted."
                        )
                    )
                ),
            }
        )
