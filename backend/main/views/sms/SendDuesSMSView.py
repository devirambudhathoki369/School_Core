from django.db.models import Q, F
from rest_framework.response import Response
from rest_framework import status as status_codes
from decimal import Decimal
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..search.StudentSearchView import StudentSearchView
from .SMSTemplateMixin import SMSTemplateMixin
from ...models.SMSLog import SMS_TYPE_DUES
from . import placeholders as PH


class SendDuesSMSView(StudentSearchView, SMSTemplateMixin):
    # Staff send on the school's behalf when their menu grants it; the
    # authenticator checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    STUDENT_STATUS_RUNNING = 1
    include_docs = False

    def post(self, request):
        # required student-info: name, guardian-name, class-name, paid-amount, balance!
        school_id = request.data.get("school")
        if school_id:
            template_type = request.data.pop("template_type")
            template = self.getSMSTemplate(school_id, template_type)
            if template:
                template = template.get("template")
                include_name = self.hasPlaceholder(template, PH.Student_Name_PH)
                include_balance = True  # no need to check for this placeholder!
                include_paid = self.hasPlaceholder(template, PH.Paid_Amount_PH)
                include_guardian_name = self.hasPlaceholder(
                    template, PH.Guardian_Name_PH
                )
                include_classname = self.hasPlaceholder(template, PH.Class_Name_PH)
                include_birth_date = self.hasPlaceholder(template, PH.BIRTH_DATE_PH)
                q = Q(is_active=True, status=self.STUDENT_STATUS_RUNNING)
                q &= self.byClassInfoQuery(school_id, request.data, False)
                RETURN_FIELDS = ["class_info", "contact_no"]
                # print(q)
                students = self.getStudentsDetails(q, None, False)
                students = students.annotate(
                    class_academic_year=F("class_info__academic_year"),
                )
                if include_balance:
                    students = self._include_contact(students)
                    RETURN_FIELDS.append("balance")
                    if include_name:
                        RETURN_FIELDS.append("name")
                    if include_paid:
                        RETURN_FIELDS.append("total_debit")
                    if include_birth_date:
                        RETURN_FIELDS.append("birth_date")
                    students = self._includeBalance(school_id, students)
                    # filter by balance!
                    balance_gt = request.data.pop("balance_gt", 0)
                    try:
                        balance_gt = Decimal(balance_gt or 0)
                        students = students.filter(balance__gte=balance_gt)
                    except:
                        pass
                    if include_guardian_name:
                        RETURN_FIELDS.append("guardian_name")
                        students = self._include_guardian_name(students)
                    students = students.values(*RETURN_FIELDS)
                    if include_classname:
                        if isinstance(students, list):
                            for std in students:
                                std["classname"] = self.cacheClassname(
                                    std.get("class_info")
                                )
                    data = self.prepareSMS(students, template)
                    #
                    sms_api = self.schoolSMSKey(school_id)
                    if sms_api:
                        status = self.sendSMS(
                            data,
                            sms_api,
                            school=school_id,
                            sms_type=SMS_TYPE_DUES,
                        )
                        if status == 200:
                            return Response({"message": "SMS sent!"})
                    else:
                        return Response(
                            {"message": "API key not found!"},
                            status=status_codes.HTTP_404_NOT_FOUND,
                        )
            else:
                return Response(
                    {"message": "SMS Template not found!"},
                    status=status_codes.HTTP_404_NOT_FOUND,
                )
        return self.RESPONSE__INVALID_REQUEST
