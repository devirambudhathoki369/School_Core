from datetime import datetime

#
from rest_framework.response import Response

#
from account.auth.Authentication import AdminTokenAuthentication
from .BaseViews import SecuredAPIView


def _parse_time(value):
    """Accept 'HH:MM' or 'HH:MM:SS' (or empty) -> time | None."""
    if not value:
        return None
    for fmt in ("%H:%M:%S", "%H:%M"):
        try:
            return datetime.strptime(value, fmt).time()
        except (ValueError, TypeError):
            continue
    return None


def _fmt(t):
    return t.strftime("%H:%M") if t else None


class AttendanceTimeSetView(SecuredAPIView):
    """
    Read / set the logged-in school's attendance in & out times.

    The in-time is a present cutoff: a first device punch after it is left
    absent automatically. Only available when the superadmin has enabled
    `time_set_required` for the school.
    """

    authentication_classes = (AdminTokenAuthentication,)

    def _school(self, request):
        return getattr(request.user, "schooladmin", None)

    def get(self, request):
        school = self._school(request)
        if not school:
            return self.RESPONSE__INVALID_REQUEST
        return Response(
            {
                "time_set_required": school.time_set_required,
                "attendance_in_time": _fmt(school.attendance_in_time),
                "attendance_out_time": _fmt(school.attendance_out_time),
            }
        )

    def put(self, request):
        school = self._school(request)
        if not school:
            return self.RESPONSE__INVALID_REQUEST
        if not school.time_set_required:
            return Response(
                {"message": "Time set is not enabled for this school."}, 403
            )
        school.attendance_in_time = _parse_time(request.data.get("attendance_in_time"))
        school.attendance_out_time = _parse_time(
            request.data.get("attendance_out_time")
        )
        school.save(update_fields=["attendance_in_time", "attendance_out_time"])
        return Response(
            {
                "message": "Attendance times updated!",
                "attendance_in_time": _fmt(school.attendance_in_time),
                "attendance_out_time": _fmt(school.attendance_out_time),
            }
        )
