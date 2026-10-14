from django.db.models import Q, F

#
from rest_framework.response import Response
from rest_framework import status as status_codes

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..search.StudentSearchView import StudentSearchView
from .SMSTemplateMixin import SMSTemplateMixin
from ...models.SMSLog import SMS_TYPE_BULK
from . import placeholders as PH


class SendBulkSMSView(StudentSearchView, SMSTemplateMixin):
    # Staff send on the school's behalf when their menu grants it; the
    # authenticator checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STUDENT_STATUS_RUNNING = 1
    include_docs = False

    def post(self, request):
        school_id = request.data.get("school")
        if school_id:
            template = request.data.get("message")
            # include_name = self.hasPlaceholder(template, PH.Student_Name_PH)
            include_balance = self.hasPlaceholder(template, PH.Balance_Amount_PH)
            include_paid = self.hasPlaceholder(template, PH.Paid_Amount_PH)
            include_guardian_name = self.hasPlaceholder(template, PH.Guardian_Name_PH)
            include_classname = self.hasPlaceholder(template, PH.Class_Name_PH)
            include_birth_date = self.hasPlaceholder(template, PH.BIRTH_DATE_PH)
            bus_station = request.data.get("station")
            #
            q = Q(
                class_info__school__id=school_id,
                is_active=True,
                status=self.STUDENT_STATUS_RUNNING,
            )
            if any(field in request.data for field in self.STRING_FIELDS):
                q &= self.query(
                    fields=self.STRING_FIELDS, data=request.data, fieldType="string"
                )
            if "education_level" in request.data:
                q &= self.byClassInfoQuery(school_id, request.data, False)
            RETURN_FIELDS = ["class_info", "contact_no", "name"]
            # print(q)
            students = self.getStudentsDetails(q, None, False)
            students = students.annotate(
                class_academic_year=F("class_info__academic_year"),
            )
            students = self._include_contact(students)
            if bus_station and isinstance(bus_station, int):
                students = self._includeStation(school_id, students, bus_station, True)
            if include_balance or include_paid:
                students = self._includeBalance(school_id, students)
                RETURN_FIELDS.append("balance")
                RETURN_FIELDS.append("total_debit")
            if include_birth_date:
                RETURN_FIELDS.append("birth_date")
            if include_guardian_name:
                RETURN_FIELDS.append("guardian_name")
                students = self._include_guardian_name(students)
            students = students.values(*RETURN_FIELDS)
            if include_classname:
                if isinstance(students, list):
                    for std in students:
                        std["classname"] = self.cacheClassname(std.get("class_info"))
            data = self.prepareSMS(students, template)
            sms_api = self.schoolSMSKey(school_id)
            if sms_api:
                status = self.sendSMS(
                    data, sms_api, school=school_id, sms_type=SMS_TYPE_BULK
                )
                if status == 200:
                    count = len(data.get("contacts") or [])
                    return Response({"message": f"SMS sent to {count} users!"})
                else:
                    return Response(
                        {"message": "API key not found!"},
                        status=status_codes.HTTP_404_NOT_FOUND,
                    )
        return self.RESPONSE__INVALID_REQUEST
