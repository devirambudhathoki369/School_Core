"""
Superadmin: which schools' students each library may serve.

  GET  /library/manage/guest-schools        (superadmin)
       every active school, plus the guest-school ids already assigned to each,
       so the picker can be drawn in one request.

  PUT  /library/manage/guest-schools        (superadmin)
       replace one host school's whole guest list.
       {"school": <id>, "guest_schools": [<id>, ...]}

WHY THIS IS NOT ON THE SCHOOL'S OWN SCREEN. Being a guest school means this
library can look up, and issue books to, ANOTHER school's students — names,
classes and contact rows that belong to a different customer. The school
receiving that access is the last party who should be able to grant it to
itself, so the write side lives here and `LibraryGuestSchoolView` is read-only.
"""

from django.db import transaction
from django.db.models import F

from rest_framework.response import Response

from account.auth.Authentication import SuperAdminTokenAuthentication
from main.views.BaseViews import SecuredAPIView
from main.models.SchoolAdmin import SchoolAdmin

from ..models.Library import LibraryGuestSchool


class ManageLibraryGuestSchoolsView(SecuredAPIView):
    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        schools = list(
            SchoolAdmin.objects.filter(is_active=True)
            .values("id", "name", "address", "logo")
            .order_by("name")
        )
        pairs = LibraryGuestSchool.objects.filter(is_active=True).values_list(
            "school", "guest_school"
        )
        # host school id -> [guest school ids]
        assigned = {}
        for host_id, guest_id in pairs:
            assigned.setdefault(host_id, []).append(guest_id)

        return Response(
            {
                "schools": schools,
                "assignments": {str(k): v for k, v in assigned.items()},
            }
        )

    def put(self, request):
        host_id = request.data.get("school")
        requested = request.data.get("guest_schools")
        if not host_id or not isinstance(requested, list):
            return self.RESPONSE__INVALID_REQUEST

        host = SchoolAdmin.objects.filter(id=host_id, is_active=True).first()
        if not host:
            return self.RESPONSE__NOT_FOUND

        # Keep only real, active, other schools. A school is always allowed to
        # serve its own students, so listing itself is meaningless rather than
        # an error — it is dropped.
        wanted = set(
            SchoolAdmin.objects.filter(
                id__in=[i for i in requested if str(i).isdigit()], is_active=True
            )
            .exclude(id=host.id)
            .values_list("id", flat=True)
        )

        with transaction.atomic():
            existing = {
                row["guest_school"]: row
                for row in LibraryGuestSchool.objects.filter(school=host).values(
                    "id", "guest_school", "is_active"
                )
            }

            # Removals are soft: an issued-book record from a school that later
            # loses access must stay readable in the reports.
            to_deactivate = [
                row["id"]
                for guest_id, row in existing.items()
                if row["is_active"] and guest_id not in wanted
            ]
            if to_deactivate:
                LibraryGuestSchool.objects.filter(id__in=to_deactivate).update(
                    is_active=False
                )

            to_reactivate = [
                existing[g]["id"]
                for g in wanted
                if g in existing and not existing[g]["is_active"]
            ]
            if to_reactivate:
                LibraryGuestSchool.objects.filter(id__in=to_reactivate).update(
                    is_active=True
                )

            to_create = [g for g in wanted if g not in existing]
            if to_create:
                LibraryGuestSchool.objects.bulk_create(
                    [
                        LibraryGuestSchool(school=host, guest_school_id=g)
                        for g in to_create
                    ]
                )

        guests = (
            LibraryGuestSchool.objects.filter(school=host, is_active=True)
            .annotate(school_name=F("guest_school__name"))
            .values("guest_school", "school_name")
            .order_by("school_name")
        )
        return Response(
            {
                "message": f"Library access updated for {host.name}.",
                "school": host.id,
                "guest_schools": list(guests),
            }
        )
