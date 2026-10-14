from django.db.models import F

#
import requests
import os
import json

#
from ...methods.nameConcat import nameConcat
from ...methods.genClassname import getClassDetails
from ...methods.smsLog import record_sms
from ...models.SMSTemplate import SMSTemplate
from ...models.SMSLog import SMS_TYPE_ATTENDANCE
from . import placeholders as PH

SMS_API = os.environ.get("SMS_BULK_API")
headers = {"Content-Type": "application/json"}


def _response_body(res):
    """The gateway's JSON, or None when it answered with something else."""
    try:
        return res.json()
    except ValueError:
        return None


def resolveSchoolForAPIKey(api_key):
    """
    Last-resort owner lookup for a send that did not name its school.

    Resolved ONLY when the key belongs to exactly one school. Keys are issued per
    school today, but if two ever shared one, guessing would file one school's
    messages under another — a tenant leak in a report we are about to show them.
    Better an unattributed row than a misattributed one.
    """
    if not api_key:
        return None
    # local import: models import this package's siblings at module load.
    from ...models.SchoolAdmin import SchoolAdmin

    schools = list(
        SchoolAdmin.objects.filter(account__sms_api=api_key).values_list(
            "id", flat=True
        )[:2]
    )
    return schools[0] if len(schools) == 1 else None


class SMSTemplatePlaceholderMixin:
    def _include_student_name(self, students):
        return students.annotate(name=nameConcat())

    def _include_contact(self, students):
        return students.annotate(contact_no=F("guardian_info__guardian_contact"))

    def _include_guardian_name(self, students):
        return students.annotate(guardian_name=F("guardian_info__father_name"))


class SMSTemplateMixin(SMSTemplatePlaceholderMixin):
    # SMSTemplate.type for the absent-student attendance template.
    template_type_attendance = 4

    def schoolSMSKey(self, school_id):
        """The school's SMS gateway key — kept on its admin account.

        Read from the school, never from `request.user`: a staff member sending
        on the school's behalf signs in with a StaffAccount, which has no key,
        so `request.user.sms_api` failed for them. For an admin the two are the
        same account (the authenticator has already checked the school is
        theirs), so nothing changes there.
        """
        from ...models.SchoolAdmin import SchoolAdmin

        school = (
            SchoolAdmin.objects.select_related("account")
            .only("account__sms_api")
            .filter(id=school_id)
            .first()
        )
        return getattr(school.account, "sms_api", None) if school else None

    def getSMSTemplate(self, school_id, template_type):
        template = (
            SMSTemplate.objects.filter(school=school_id, type=template_type)
            .order_by("-id")
            .values("id", "template")
            .first()
        )
        return template

    def hasPlaceholder(self, template, placeholder):
        if placeholder in template:
            return True
        return False

    def prepareSMS(self, students, template):
        data = {"contacts": [], "messages": []}
        for std in students:
            contact = std.get("contact_no")
            if contact:
                data["contacts"].append(contact)
                msg = template
                data["messages"].append(self.prepareMessage(msg, std))
        return data

    def prepareMessage(self, template, std):
        # A row without a name is not worth crashing a whole send over — the
        # placeholder simply resolves to nothing for that one recipient.
        name = (std.get("name") or "").title()
        template = (
            template.replace(PH.Student_Name_PH, name)
            # staff templates address the person the same way; both names read
            # the same annotated field, so one row can satisfy either.
            .replace(PH.Staff_Name_PH, name)
            .replace(PH.Designation_PH, str(std.get("designation") or ""))
            .replace(PH.Balance_Amount_PH, str(std.get("balance")))
            .replace(PH.Paid_Amount_PH, str(std.get("total_debit")))
            .replace(PH.Class_Name_PH, std.get("classname") or "")
            .replace(PH.Guardian_Name_PH, std.get("guardian_name") or "")
            .replace(PH.BIRTH_DATE_PH, std.get("birth_date") or "")
        )
        # print(template)
        return template

    def sendSMS(self, data, api_key, school=None, sms_type=None):
        """
        Hand a prepared payload to the gateway and write the school's SMS log.

        `school`/`sms_type` are what put a send on the school's SMS report. They
        are optional so no existing caller breaks, but every caller in this repo
        passes them — an unattributed send would still be charged to the school
        while being invisible in their report.
        """
        contacts = data.get("contacts")
        if len(contacts) == 0:
            return 500
        messages = data.get("messages")
        payload = {"auth_token": api_key, "to": contacts, "text": messages}
        school = school or resolveSchoolForAPIKey(api_key)
        try:
            res = requests.post(
                url=SMS_API,
                headers=headers,
                data=json.dumps(payload),
                timeout=(5, 45),
            )
            if res.status_code < 400:
                # balance just changed at the provider — refresh the cached
                # credits so the dashboard catches up without waiting out the
                # staleness window (lazy import: SMSViews also imports from
                # this package)
                from .SMSViews import refresh_credits_for_api_key

                refresh_credits_for_api_key(api_key)
            record_sms(
                school,
                sms_type,
                contacts,
                messages,
                response=_response_body(res),
                failed=res.status_code >= 400,
            )
            return res.status_code
        except Exception as e:
            # print(e)
            # The send is gone either way; the log still records the attempt so
            # a school can see that a message was tried and did not go out.
            record_sms(school, sms_type, contacts, messages, failed=True)
            return 500

    def send_absent_sms(self, school_id, students, sms_api):
        """
        Send the attendance-absence SMS to the given absent students, using the
        school's attendance SMS template. Returns the SMS gateway status code, or
        None if the school has no attendance template configured.

        Two callers, one identical message (same template, same placeholder
        handling, same gateway):
          - ClassAttendanceSerializer.create — automatic, on the first save of a
            class's attendance from the app/web.
          - AbsentSMSView — the manual "Send Messages" admin flow, used by RFID/UHF
            schools whose attendance is written by the readers, not by a teacher.
        """
        template = self.getSMSTemplate(school_id, self.template_type_attendance)
        if not template:
            return None
        template = template.get("template")
        include_name = self.hasPlaceholder(template, PH.Student_Name_PH)
        include_guardian_name = self.hasPlaceholder(template, PH.Guardian_Name_PH)
        include_classname = self.hasPlaceholder(template, PH.Class_Name_PH)
        #
        _return_fields = ["class_info", "contact_no"]
        students = self._include_contact(students)
        if include_name:
            students = self._include_student_name(students)
            _return_fields.append("name")
        if include_guardian_name:
            students = self._include_guardian_name(students)
            _return_fields.append("guardian_name")
        students = students.values(*_return_fields)
        if include_classname:
            if isinstance(students, list):
                for std in students:
                    [_classname, _] = getClassDetails(
                        std.get("class_info"), include_details=False
                    )
                    std["classname"] = _classname
        data = self.prepareSMS(students, template)
        return self.sendSMS(
            data, sms_api, school=school_id, sms_type=SMS_TYPE_ATTENDANCE
        )
