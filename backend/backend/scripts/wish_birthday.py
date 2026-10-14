import sys
import os
import django


current_path = os.path.dirname(os.path.abspath(__file__))
project_root = os.path.abspath(os.path.join(current_path, "../../"))
if project_root not in sys.path:
    sys.path.append(project_root)

# Safe to run again when this module is imported from a management command:
# `django.setup()` short-circuits once the app registry is populated.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
django.setup()
#
from django.db.models import Subquery, OuterRef, F, Value

#
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student
from main.models.Staff import Staff
from main.models.SMSTemplate import (
    SMSTemplate,
    TEMPLATE_TYPE_BIRTHDAY,
    TEMPLATE_TYPE_STAFF_BIRTHDAY,
)
from main.views.sms.SMSTemplateMixin import SMSTemplateMixin
from main.models.SMSLog import SMS_TYPE_BIRTHDAY
from main.methods.nameConcat import nameConcat
from customs.Extract import ExtractDay, ExtractMonth
from customs.JSONBuildObject import JSONBuildObject
from customs.JSONListAgg import JSONListAgg
from nepali_datetime import date
from concurrent.futures import ThreadPoolExecutor, as_completed


class BirthdayWisher(SMSTemplateMixin):
    """
    The daily birthday SMS.

    Students and staff are two independent runs sharing one machine: each has
    its own template type, its own school preference and its own recipient
    query, so a school can wish students without wishing staff (or the other
    way round) and turning one on cannot start the other sending.

    Both runs work the same way — one query gathers, per school, the school's
    API key, its template, and a JSON array of today's birthday people; schools
    with no template or nobody to wish drop out before any request is made.
    """

    birthdaywish_template_type = TEMPLATE_TYPE_BIRTHDAY
    staff_birthdaywish_template_type = TEMPLATE_TYPE_STAFF_BIRTHDAY
    status_running = 1
    staff_status_employed = 1

    # SchoolAdmin.preferences keys — the school's own opt-in per audience.
    student_preference = "birthday_sms_auto_wish"
    staff_preference = "staff_birthday_sms_auto_wish"

    def wish(self) -> None:
        self.wish_students()
        self.wish_staffs()

    def wish_students(self) -> None:
        schools = self._schools(
            self.student_preference,
            self.birthwish_template_sq(self.birthdaywish_template_type),
            self.students_sq(),
        )
        try:
            self.sendConcurrentMultipleSMS(schools)
        except Exception:
            pass

    def wish_staffs(self) -> None:
        schools = self._schools(
            self.staff_preference,
            self.birthwish_template_sq(self.staff_birthdaywish_template_type),
            self.staffs_sq(),
        )
        try:
            self.sendConcurrentMultipleSMS(schools)
        except Exception:
            pass

    def _schools(self, preference, template_sq, people_sq):
        """
        Schools that have opted in, have an SMS key, have written the template
        and have somebody with a birthday today. `people` is the JSON array the
        subquery aggregated; the field name is shared so one sender handles both.
        """
        return (
            SchoolAdmin.objects.filter(
                is_active=True,
                account__sms_api__isnull=False,
                **{f"preferences__{preference}": True},
            )
            .annotate(template=template_sq, people=people_sq)
            .filter(template__isnull=False, people__isnull=False)
            .values_list("id", "account__sms_api", "template", "people")
        )

    def prepPayloads(self, schools):
        # for each school-id,sms-api-key and template
        # generate payloads
        schoolwise_payloads = [
            {
                "auth_token": api_key,
                "to": payload.get("contacts"),
                "text": payload.get("messages"),
            }
            for [_, api_key, template, people] in schools
            for payload in [self.prepareSMS(people, template)]
            if len(payload.get("contacts") or []) > 0
        ]
        return schoolwise_payloads

    def sendConcurrentMultipleSMS(self, schools):
        with ThreadPoolExecutor(max_workers=5) as executor:
            future_to_url = {
                executor.submit(
                    self.sendSMS,
                    self.prepareSMS(people, template),
                    api_key,
                    school=school_id,
                    sms_type=SMS_TYPE_BIRTHDAY,
                ): school_id
                for [school_id, api_key, template, people] in schools
                if api_key and template
            }
            # for future in as_completed(future_to_url):
            #     url = future_to_url[future]
            #     try:
            #         data = future.result()
            #     except Exception as e:
            #         pass

    def birthwish_template_sq(self, template_type):
        return Subquery(
            SMSTemplate.objects.filter(
                is_active=True,
                type=template_type,
                school=OuterRef("pk"),
            )
            .order_by("-id")
            .values("template")[:1]
        )

    def students_sq(self):
        today = date.today()
        current_month = today.month
        current_day = today.day
        object_map = [
            Value("name"),
            F("name"),
            Value("contact_no"),
            F("guardian_info__guardian_contact"),
            Value("guardian_name"),
            F("guardian_info__father_name"),
        ]
        return Subquery(
            Student.objects.filter(
                class_info__school=OuterRef("pk"),
                is_active=True,
                status=self.status_running,
            )
            .annotate(
                name=nameConcat(),
                month=ExtractMonth("birth_date"),
                day=ExtractDay("birth_date"),
            )
            .filter(
                month=current_month,
                day=current_day,
            )
            .annotate(
                student_info=JSONBuildObject(*object_map),
            )
            .values_list(JSONListAgg("student_info"), flat=True)
        )

    def staffs_sq(self):
        """
        Today's staff birthdays, per school.

        Two things differ from the student query and both matter: the birth date
        lives on `other_info`, not on the row itself, and the message goes to the
        staff member's OWN `primary_contact` — there is no guardian here.
        """
        today = date.today()
        current_month = today.month
        current_day = today.day
        object_map = [
            Value("name"),
            F("name"),
            Value("contact_no"),
            F("primary_contact"),
            Value("designation"),
            F("role__role"),
        ]
        return Subquery(
            Staff.objects.filter(
                school=OuterRef("pk"),
                is_active=True,
                status=self.staff_status_employed,
            )
            .annotate(
                name=nameConcat(),
                month=ExtractMonth("other_info__birth_date"),
                day=ExtractDay("other_info__birth_date"),
            )
            .filter(
                month=current_month,
                day=current_day,
            )
            .annotate(
                staff_info=JSONBuildObject(*object_map),
            )
            .values_list(JSONListAgg("staff_info"), flat=True)
        )


if __name__ == "__main__":
    wisher = BirthdayWisher()
    wisher.wish()
