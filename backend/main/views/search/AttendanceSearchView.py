from collections import defaultdict
from django.db.models import Value, CharField, F, Count, Q
from django.db.models.functions import Lower, Concat, Collate

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import BaseSearchView
from ...models.Attendance import StudentAttendance, StaffAttendance
from ...models.Student import Student
from ...models.Staff import Staff
from ...methods.getDateRange import getDateRange
from ...methods.nameConcat import nameConcat


class AttendanceSearchView(BaseSearchView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STUDENT_STATUS_RUNNING = 1

    def post(self, request):
        school_id = request.data.pop("school")
        class_info_id = request.data.pop("class_info")
        start_date = request.data.pop("start_date")
        end_date = request.data.pop("end_date")
        count = request.data.pop("count", False)
        if school_id and class_info_id and start_date and end_date:
            date_range = getDateRange(start_date, end_date)
            if count:
                return self.classwiseStudentPresenceCount(class_info_id, date_range)
            attendances = (
                StudentAttendance.objects.filter(
                    is_active=True,
                    class_attendance__school=school_id,
                    class_attendance__class_info=class_info_id,
                    class_attendance__date__range=date_range,
                )
                .annotate(
                    date=F("class_attendance__date"),
                )
                .values(
                    "date", "student", "status",
                    "checked_in_at", "checked_out_at", "reason",
                )
            )
            if len(attendances) > 0:
                students = self.getStudentsDetails(class_info_id)
                attendances, dates = self.formatAttendances(attendances)
                return Response(
                    {
                        "students": students,
                        "data": attendances,
                        "dates": dates,
                    }
                )
            else:
                return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST

    def formatAttendances(self, attendances):
        data = defaultdict(lambda: defaultdict(lambda: dict))
        # Column order must be chronological. The queryset comes back in the
        # table's physical row order (an UPDATE moves a row to the heap tail),
        # so an edited/back-dated day used to land out of place — or look
        # "missing" once the reader scrolled past where they expected it.
        # Dates are zero-padded YYYY-MM-DD, so a plain sort is chronological.
        dates = {}
        for item in attendances:
            date = item.pop("date")
            student = item.pop("student")
            dates[date] = None
            data[student][date] = {
                "status": item.pop("status"),
                "checked_in_at": item.pop("checked_in_at"),
                "checked_out_at": item.pop("checked_out_at"),
                "reason": item.pop("reason"),
            }
        return data, sorted(dates)

    def classwiseStudentPresenceCount(self, class_info_id, date_range):
        # Currently, used in marks-entry/attendance-autofill.
        data = (
            StudentAttendance.objects.filter(
                class_attendance__class_info=class_info_id,
                class_attendance__date__range=date_range,
            )
            .values("student")
            .annotate(
                present_count=Count("id", filter=Q(status=True)),
                total_count=Count("id"),
            )
        )
        if len(data) > 0:
            total_days = max((att.get("total_count", 0) for att in data), default=0)
            data = {att["student"]: att.get("present_count", 0) for att in data}
            return Response(
                {
                    "total_days": total_days,
                    "data": data,
                }
            )
        return self.RESPONSE__NOT_FOUND

    def getStudentsDetails(self, class_info_id):
        students = (
            Student.objects.filter(
                class_info=class_info_id, status=self.STUDENT_STATUS_RUNNING
            )
            .annotate(
                name=nameConcat(),
            )
            .order_by(Collate("name", "und-x-icu"))
            .values("id", "name")
        )
        return students


class StaffAttendanceSearchView(BaseSearchView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STAFF_STATUS_EMPLOYEED = 1

    def post(self, request):
        school_id = request.data.pop("school")
        start_date = request.data.pop("start_date")
        end_date = request.data.pop("end_date")
        if school_id and start_date and end_date:
            date_range = getDateRange(start_date, end_date)
            attendances = StaffAttendance.objects.filter(
                school_id=school_id,
                date__range=date_range,
                is_active=True,
            ).values(
                "date", "staff", "status", "checked_in_at", "checked_out_at",
                "reason",
            )
            if len(attendances) > 0:
                staffs = self.getStaffDetails(school_id)
                attendances, dates = self.formatAttendances(attendances)
                return Response(
                    {
                        "staffs": staffs,
                        "data": attendances,
                        "dates": dates,
                    }
                )
            else:
                return self.RESPONSE__NOT_FOUND
        return self.RESPONSE__INVALID_REQUEST

    def formatAttendances(self, attendances):
        data = defaultdict(lambda: defaultdict(lambda: dict))
        # Column order must be chronological. The queryset comes back in the
        # table's physical row order (an UPDATE moves a row to the heap tail),
        # so an edited/back-dated day used to land out of place — or look
        # "missing" once the reader scrolled past where they expected it.
        # Dates are zero-padded YYYY-MM-DD, so a plain sort is chronological.
        dates = {}
        for item in attendances:
            date = item.pop("date")
            staff = item.pop("staff")
            dates[date] = None
            data[staff][date] = {
                "status": item.pop("status"),
                "checked_in_at": item.pop("checked_in_at"),
                "checked_out_at": item.pop("checked_out_at"),
                "reason": item.pop("reason"),
            }
        return data, sorted(dates)

    def getStaffDetails(self, school_id):
        students = (
            Staff.objects.filter(
                school_id=school_id, status=self.STAFF_STATUS_EMPLOYEED
            )
            .annotate(
                name=nameConcat(),
            )
            .order_by(Collate("name", "und-x-icu"))
            .values("id", "name")
        )
        return students
