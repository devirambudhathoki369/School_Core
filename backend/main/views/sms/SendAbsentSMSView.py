from django.db.models import Count

#
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from .SMSTemplateMixin import SMSTemplateMixin
from ...models.Attendance import StudentAttendance
from ...models.SchoolAdmin import SchoolAdmin
from ...models.Student import Student
from ...methods.nepaliDatetime import ndt_today
from ...methods.absentSMS import (
    absent_sms_already_sent,
    absent_sms_sent_classes,
    mark_absent_sms_sent,
)


TAGS = ["sms"]

# SMS gateway returns 2xx on accepted requests.
SMS_OK = range(200, 300)


class AbsentSMSView(SecuredAPIView, SMSTemplateMixin):
    """
    Manual absent-student SMS — the "Send Messages" admin flow.

    Attendance marked by a teacher in the app/web sends the absent SMS on save
    (ClassAttendanceSerializer.create). Attendance captured by RFID/UHF readers
    has no such moment, so for those the admin opens this menu, sees every class
    with today's absent count, and clicks send for a class to message that class's
    absent students.

    GET  ?school=<id>            -> { "date": <BS today>,
                                       "absent_counts": { class_info_id: count },
                                       "already_sent": [class_info_id, ...] }
    POST { school, class_info }  -> sends SMS to TODAY's absent students of the
                                    class. Returns { sent, message }. Refuses with
                                    409 if that class was already messaged today
                                    (pass force=true to send anyway).
    """

    # Staff send on the school's behalf when their menu grants it; the
    # authenticator checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    include_docs = True

    def _absent_student_ids(self, school_id, class_info_id, date):
        return (
            StudentAttendance.objects.filter(
                class_attendance__school=school_id,
                class_attendance__class_info=class_info_id,
                class_attendance__date=date,
                status=False,
                is_active=True,
            )
            .values_list("student_id", flat=True)
            .distinct()
        )

    @swagger_auto_schema(
        tags=TAGS,
        operation_description="Today's absent-student count per class (for the Send Messages menu)",
    )
    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST

        today = ndt_today()
        rows = (
            StudentAttendance.objects.filter(
                class_attendance__school=school_id,
                class_attendance__date=today,
                status=False,
                is_active=True,
            )
            .values("class_attendance__class_info")
            .annotate(absent=Count("student_id", distinct=True))
        )
        counts = {r["class_attendance__class_info"]: r["absent"] for r in rows}
        return Response(
            {
                "date": today,
                "absent_counts": counts,
                # classes whose absent SMS already went out today (auto on save,
                # or an earlier click here) — so we don't send twice.
                "already_sent": absent_sms_sent_classes(
                    school_id, counts.keys(), today
                ),
            }
        )

    @swagger_auto_schema(
        tags=TAGS,
        operation_description="Send absent-student SMS to one class for today",
    )
    def post(self, request):
        school_id = request.data.get("school")
        class_info_id = request.data.get("class_info")
        if not (school_id and class_info_id):
            return self.RESPONSE__INVALID_REQUEST

        school = (
            SchoolAdmin.objects.filter(id=school_id)
            .select_related("account")
            .only("id", "account__sms_api")
            .first()
        )
        if not school:
            return self.RESPONSE__NOT_FOUND
        sms_api = getattr(school.account, "sms_api", None)
        if not sms_api:
            return Response(
                {"message": "SMS is not configured for this school."}, status=400
            )

        today = ndt_today()
        force = request.data.get("force") in (True, "true", "True", 1, "1")
        if not force and absent_sms_already_sent(school_id, class_info_id, today):
            return Response(
                {
                    "message": "Absent SMS for this class has already been sent today.",
                    "sent": 0,
                },
                status=409,
            )
        absent_ids = list(self._absent_student_ids(school_id, class_info_id, today))
        if not absent_ids:
            return Response(
                {"message": "No absent students for today in this class.", "sent": 0},
                status=404,
            )

        students = Student.objects.filter(id__in=absent_ids, is_active=True)
        status_code = self.send_absent_sms(school_id, students, sms_api)
        if status_code is None:
            return Response(
                {
                    "message": "No attendance SMS template configured for this school.",
                    "sent": 0,
                },
                status=400,
            )
        if status_code in SMS_OK:
            mark_absent_sms_sent(school_id, class_info_id, today)
            return Response(
                {"message": "SMS sent to absent students.", "sent": len(absent_ids)}
            )
        return Response(
            {"message": "SMS gateway error.", "sent": 0, "gateway_status": status_code},
            status=502,
        )
