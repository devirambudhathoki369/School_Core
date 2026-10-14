from django.db.models import F

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from account.auth.UserRole import UserRoles

#
from .BaseViews import SecuredAPIView
from ..models.Attendance import StudentAttendance, StaffAttendance
from ..methods.getDateRange import getDateRange


class MyAttendanceReportView(SecuredAPIView):
    """
    Attendance report for the *currently logged-in* user — works for both staff
    and student tokens through a single route.

    POST body:  { "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD" }  (BS dates)
    Response :  {
                  "role": "staff" | "student",
                  "data": [
                    { "date": "2082-02-16", "status": true,
                      "checked_in_at": "2026-06-02T01:12:40Z" },
                    ...
                  ]
                }

    `checked_in_at` is the first punch (check-in) as a UTC instant, or null for
    manual entries / absent days. Display it in local (Asia/Kathmandu) time.
    """

    authentication_classes = (StaffTokenAuthentication, StudentTokenAuthentication)
    # a read of the caller's own attendance that the app sends as POST
    student_write_methods = ("post",)
    STUDENT_STATUS_RUNNING = 1

    def post(self, request):
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        if not (start_date and end_date):
            return self.RESPONSE__INVALID_REQUEST

        date_range = getDateRange(start_date, end_date)
        role = getattr(request, "user_role", None)
        account = request.user

        if role == UserRoles.ROLE_STAFF:
            staff = getattr(account, "staff", None)
            if not staff:
                return self.RESPONSE__NOT_FOUND
            rows = (
                StaffAttendance.objects.filter(
                    staff=staff,
                    is_active=True,
                    date__range=date_range,
                )
                .order_by("date")
                .values("date", "status", "checked_in_at", "checked_out_at")
            )
        elif role == UserRoles.ROLE_STUDENT:
            student = getattr(account, "student", None)
            if not student:
                return self.RESPONSE__NOT_FOUND
            rows = (
                StudentAttendance.objects.filter(
                    student=student,
                    is_active=True,
                    class_attendance__date__range=date_range,
                )
                .annotate(date=F("class_attendance__date"))
                .order_by("date")
                .values("date", "status", "checked_in_at", "checked_out_at")
            )
        else:
            return self.RESPONSE__INVALID_REQUEST

        data = [
            {
                "date": row["date"],
                "status": row["status"],
                "checked_in_at": row["checked_in_at"],
                "checked_out_at": row["checked_out_at"],
            }
            for row in rows
        ]
        return Response({"role": role, "data": data})
