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
from ..BaseViews import BaseSearchView
from .SMSTemplateMixin import SMSTemplateMixin
from . import placeholders as PH
from ...models.Staff import Staff
from ...models.SMSLog import SMS_TYPE_STAFF
from ...methods.nameConcat import nameConcat


class SendStaffSMSView(BaseSearchView, SMSTemplateMixin):
    """
    Bulk SMS to teachers and other staff.

    The student-side counterpart (SendBulkSMSView) sends to the GUARDIAN's
    number, which is exactly why it could not be reused here: a message meant
    for a teacher has to arrive on the teacher's own phone. So this selects
    staff and sends to `primary_contact`.

    The filter is deliberately the same shape the staff search accepts — name
    parts, role and employment status — so the count the admin reviewed before
    sending is the count that actually receives the message.
    """

    # Staff send on the school's behalf when their menu grants it; the
    # authenticator checks the `school` sent is theirs.
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    include_docs = False

    STAFF_STATUS_EMPLOYED = 1
    STRING_FIELDS = ("first_name", "middle_name", "last_name")

    def post(self, request):
        school_id = request.data.get("school")
        template = request.data.get("message")
        if not school_id or not template:
            return self.RESPONSE__INVALID_REQUEST

        sms_api = self.schoolSMSKey(school_id)
        if not sms_api:
            return Response(
                {"message": "SMS API key not found! Set it under SMS Settings."},
                status=status_codes.HTTP_404_NOT_FOUND,
            )

        staff_status = request.data.get("status") or self.STAFF_STATUS_EMPLOYED
        role = request.data.get("role")

        q = Q(school__id=school_id, is_active=True, status=staff_status)
        if any(field in request.data for field in self.STRING_FIELDS):
            q &= self.query(
                fields=self.STRING_FIELDS, data=request.data, fieldType="string"
            )
        if role:
            q &= Q(role__id=role)

        staffs = Staff.objects.filter(q).annotate(
            name=nameConcat(),
            contact_no=F("primary_contact"),
        )
        RETURN_FIELDS = ["name", "contact_no"]
        if self.hasPlaceholder(template, PH.Designation_PH):
            staffs = staffs.annotate(designation=F("role__role"))
            RETURN_FIELDS.append("designation")

        staffs = staffs.values(*RETURN_FIELDS)
        # prepareSMS drops anyone without a contact number, so `selected` and
        # the sent count can differ — the response says so rather than
        # reporting a send to people who were never reachable.
        selected = len(staffs)
        data = self.prepareSMS(staffs, template)
        count = len(data.get("contacts") or [])
        if count == 0:
            return Response(
                {"message": "No staff with a contact number matched this filter!"},
                status=status_codes.HTTP_404_NOT_FOUND,
            )

        sent_status = self.sendSMS(
            data, sms_api, school=school_id, sms_type=SMS_TYPE_STAFF
        )
        if sent_status == 200:
            skipped = selected - count
            message = f"SMS sent to {count} staff!"
            if skipped > 0:
                message += f" {skipped} skipped (no contact number)."
            return Response({"message": message})
        return Response(
            {"message": "Could not send the SMS. Check the SMS API key and credits."},
            status=status_codes.HTTP_400_BAD_REQUEST,
        )
