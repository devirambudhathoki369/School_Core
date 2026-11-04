"""A person's canteen profile.

  GET /canteen/profile ?school=&q=  or  &card=  or  &class_key=[&q=]    find them
  GET /canteen/profile ?school=&buyer_type=&buyer=     the whole page
  POST /canteen/student-search                         Payment's search form
  GET /canteen/class-options ?school=                  what its class picker offers

Read-only, and the page's own permission (PAGE_PROFILE). See methods/profile.py.

The last two exist so the Payment page can use the school's own search form. That
form's class picker normally reads /api/sections, /api/courses and the hidden
education levels, and a canteen user's sign-in opens /canteen alone. The same
answers come from here instead, rather than opening those to a canteen token.
"""

from django.db.models import Q
from rest_framework.response import Response

from main.models.ClassInfo import ClassInfo
from main.models.Course import Course
from main.models.Section import Section
from main.models.superadmin.SchoolEducationLevel import SchoolHiddenEducationLevel
from main.views.fields import (
    CHOICES_CLASS_DETAILS_FIELDS,
    CLASS_DETAILS_FIELDS,
    FOREIGN_CLASS_DETAILS_FIELDS,
)

from ..constants import BUYER_STAFF, BUYER_STUDENT, PAGE_ACCOUNTS, PAGE_COLLECT, PAGE_PROFILE
from ..methods.profile import find_people, profile_of, search_people
from ..methods.settings import settings_for
from .BaseViews import CanteenBaseView


class CanteenProfileView(CanteenBaseView):
    # The Payment page searches and opens a person's ledger through this too.
    pages_for = {"GET": (PAGE_PROFILE, PAGE_COLLECT)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        params = request.query_params
        settings = settings_for(school_id)
        today = self.today()
        buyer = self.int_or_none(params.get("buyer"))
        if not buyer:
            return Response({
                "people": find_people(
                    school_id, settings, today,
                    q=(params.get("q") or "").strip(), card=(params.get("card") or "").strip(),
                    wanted_class=(params.get("class_key") or "").strip(),
                )
            })
        buyer_type = self.int_or_none(params.get("buyer_type")) or BUYER_STUDENT
        if buyer_type not in (BUYER_STUDENT, BUYER_STAFF):
            return self.RESPONSE__INVALID_REQUEST
        data = profile_of(school_id, settings, today, buyer_type, buyer)
        if not data:
            return self.RESPONSE__NOT_FOUND
        # The family's number stays with whoever holds Card Accounts, as it does
        # at every other buyer lookup in this module.
        if PAGE_ACCOUNTS not in self.pages_held(request, school_id):
            data["contact"] = None
        return Response(data)


class CanteenStudentSearchView(CanteenBaseView):
    """The search form of Payment > Student, on canteen data: names start with what
    is typed, the class is read the same way, and status means running unless asked.

    The Student ID box also takes a canteen card: a USB reader types the number and
    presses Enter. Staff owe the canteen too, so a name finds them as well.
    """

    NAMES = ("first_name", "middle_name", "last_name")
    pages_for = {"POST": (PAGE_COLLECT,)}

    def post(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # A blank field is a field not filled, never "where this is empty".
        data = {k: v for k, v in request.data.items() if v not in (None, "")}
        typed_id = str(data.get("student_id") or "").strip()
        level = data.get("education_level")
        if not typed_id and not data.get("first_name") and not level:
            return Response({"message": "Student ID, Name or Education Level is required!"}, status=400)
        status = self.int_or_none(data.get("status")) or 1
        if status not in (1, 2, 3):
            return self.RESPONSE__INVALID_REQUEST

        names = self.query(fields=self.NAMES, data=data, fieldType="string")
        student_q = Q(class_info__school_id=school_id, is_active=True, status=status) & names
        staff_q = names if status == 1 and any(field in data for field in self.NAMES) and not level else None
        if typed_id:
            match = Q(rfid_card=typed_id)
            if typed_id.isdigit() and len(typed_id) <= 9:
                match |= Q(id=int(typed_id))
            student_q &= match
            staff_q = Q(rfid_card=typed_id) & names if status == 1 else None
        if level:
            student_q &= self.query(
                fields=FOREIGN_CLASS_DETAILS_FIELDS, data=data, fieldType="foreign", parent="class_info",
            ) & self.query(
                fields=CHOICES_CLASS_DETAILS_FIELDS, data=data, fieldType="choices", parent="class_info",
            )
        people = search_people(school_id, settings_for(school_id), self.today(), student_q, staff_q)
        # As on the profile: the family's number is for whoever holds Card Accounts.
        if PAGE_ACCOUNTS not in self.pages_held(request, school_id):
            for person in people:
                person["contact"] = person["guardian_contact"] = None
        return Response(people)


class CanteenClassOptionsView(CanteenBaseView):
    """What the class picker offers: the same classes, sections and courses it reads
    for a school login, and the education levels hidden for this school."""

    pages_for = {"GET": (PAGE_COLLECT,)}

    def get(self, request):
        denied = self.gate(request)
        if denied:
            return denied
        school_id = self.school_id(request)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        classes = list(
            ClassInfo.objects.filter(school=school_id, section__isnull=False, is_active=True).values(*CLASS_DETAILS_FIELDS)
        )
        sections = dict(
            Section.objects.filter(id__in={c["section"] for c in classes}).values_list("id", "section")
        )
        courses = list(
            Course.objects.filter(school_id=school_id, is_active=True).values("id", "education_level", "course", "faculty")
        )
        hidden = list(
            SchoolHiddenEducationLevel.objects.filter(school_id=school_id).values_list("education_level", flat=True)
        )
        return Response({"classes": classes, "sections": sections, "courses": courses, "hidden": hidden})
