"""Per-school education-level visibility.

  GET  /api/school-education-levels?school=X   -> {"hidden": [level ids]}
       readable by any logged-in user (the class/level pickers use it to omit
       levels a school doesn't use). No rows = all levels visible (default).

  PUT  /api/school-education-levels  (superadmin) {school, hidden: [ids]}
       replaces the school's hidden set.
"""

from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.superadmin.SchoolEducationLevel import SchoolHiddenEducationLevel


def _hidden_for(school_id):
    return list(
        SchoolHiddenEducationLevel.objects.filter(school_id=school_id)
        .values_list("education_level", flat=True)
    )


class SchoolHiddenEducationLevelsView(SecuredAPIView):
    """Read the hidden-level set for a school (used by the pickers)."""

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        return Response({"hidden": _hidden_for(school_id)})


class ManageSchoolEducationLevelsView(SecuredAPIView):
    """Superadmin sets which levels are hidden for a school."""

    authentication_classes = (SuperAdminTokenAuthentication,)

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        return Response({"hidden": _hidden_for(school_id)})

    def put(self, request):
        school_id = request.data.get("school")
        hidden = request.data.get("hidden")
        if not school_id or hidden is None:
            return self.RESPONSE__INVALID_REQUEST
        try:
            hidden_ids = [int(x) for x in hidden]
        except (TypeError, ValueError):
            return self.RESPONSE__INVALID_REQUEST
        # replace the school's hidden set
        SchoolHiddenEducationLevel.objects.filter(school_id=school_id).delete()
        SchoolHiddenEducationLevel.objects.bulk_create(
            [
                SchoolHiddenEducationLevel(school_id=school_id, education_level=lvl)
                for lvl in set(hidden_ids)
            ]
        )
        return Response({"message": "Education levels updated!", "hidden": sorted(set(hidden_ids))})
