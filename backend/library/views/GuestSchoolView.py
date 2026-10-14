from django.db.models import F

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView

#
from ..models.Library import LibraryGuestSchool


class LibraryGuestSchoolView(SecuredAPIView):
    """
    Schools whose students/staff this school's library may issue books to.

    READ ONLY. Being a guest school means this library can look up and issue
    books to ANOTHER school's students, so the school gaining that access must
    not be able to grant it to itself — assignment lives with the superadmin
    (`ManageLibraryGuestSchoolsView`, PUT /library/manage/guest-schools).

    This endpoint is what the Book Issue/Return page reads to know which schools
    it currently serves, which is also the search scope for a borrower lookup.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        as_options = self.getBooleanValue(request.query_params.get("as_options"))
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        guests = (
            LibraryGuestSchool.objects.filter(school=school_id, is_active=True)
            .annotate(school_name=F("guest_school__name"))
            .values("id", "guest_school", "school_name")
            .order_by("school_name")
        )
        if as_options:
            return Response(
                [{"value": e["guest_school"], "name": e["school_name"]} for e in guests]
            )
        return Response(guests)
