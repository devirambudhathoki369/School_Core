from django.db.models import Q, CharField, Case, When, F, Value
from django.db.models.functions import Coalesce

#
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import SimpleRateThrottle, AnonRateThrottle
from django.conf import settings

#
from account.models import StudentAccount
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from main.methods.bloodgroupQuery import bloodgroupQuery
from main.methods.digitalId import code_is_good, digital_id_code
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student
from main.models.Staff import Staff
from main.models.ClassInfo import ClassInfo
from main.methods.nameConcat import nameConcat
from main.methods.genClassname import getClassDetails
from main.views.BaseViews import SecuredAPIView

school_fields = [
    "name",
    "address",
    "contact",
    "telephone",
    "email",
    "estd_date",
    "slogan",
    "about_us",
    "logo",
    "award_logo",
]
student_fields = [
    "image",
    "name",
    "class_info",
    "birth_date",
    "blood_group",
    "guardian_name",
    "guardian_address",
    "guardian_contact",
]
staff_fields = [
    "image",
    "name",
    "birth_date",
    "blood_group",
    "designation",
    "location",
    "primary_contact",
    "secondary_contact",
]
Roles = {
    "student": 1,
    "staff": 2,
}
LINK_WITHOUT_CODE = ("name", "classname", "designation")


class PublicProfileThrottle(SimpleRateThrottle):
    scope = "public_profile"
    rate = "10/hour"

    def get_cache_key(self, request, view):
        org = request.query_params.get("org")
        user = request.query_params.get("user")
        if org and user:
            ident = f"{org}:{user}"
            return self.cache_format % {"scope": self.scope, "ident": ident}
        return None


class PublicProfileIPThrottle(AnonRateThrottle):
    """
    Per-client cap across ALL profiles.

    The throttle above is keyed on the (org, user) PAIR, so it never slowed
    anyone walking the ids: each new id is a new pair. With sequential ids that
    made this unauthenticated endpoint a bulk export of every pupil's photo,
    birth date, guardian, phone and address. A person scanning ID cards needs
    a handful an hour; the cap is generous and set from settings.
    """

    scope = "public_profile_ip"

    def get_rate(self):
        return getattr(settings, "PUBLIC_PROFILE_RATE", "120/hour")


class PublicProfileView(APIView):
    throttle_classes = (PublicProfileThrottle, PublicProfileIPThrottle)
    swagger_schema = None

    def get(self, request):
        organization = request.query_params.get("org")
        user = request.query_params.get("user")
        role = request.query_params.get("role") or Roles["student"]
        if organization and user and role:
            try:
                role = int(role)
            except:
                pass
            school_q = Q(id=organization)
            _org = SchoolAdmin.objects.filter(school_q).values(*school_fields).first()
            _user = {}
            # The person must belong to the organisation the link names — a
            # card's QR always pairs the two. Looked up by id alone, any `org`
            # unlocked every school's people.
            if role == Roles["staff"]:
                _user = self.getStaff(user, organization)
            elif role == Roles["student"]:
                _user = self.getStudent(user, organization)
            # A link without its code could have been guessed from its ids, and
            # cards printed before codes have none: they show who, not how to reach.
            if _user and not code_is_good(request.query_params.get("c"), role, organization, user):
                _user = {key: _user.get(key) for key in LINK_WITHOUT_CODE if key in _user}
            return Response({"org": _org, "user": _user})
        return Response(
            {"message": "Invalid request!"}, status=status.HTTP_400_BAD_REQUEST
        )

    def getStudent(self, user_id, organization):
        student_q = Q(id=user_id, class_info__school_id=organization)
        _user = (
            Student.objects.filter(student_q)
            .annotate(
                name=nameConcat(),
                guardian_name=Coalesce(
                    F("guardian_info__guardian_name"),
                    F("guardian_info__father_name"),
                    F("guardian_info__mother_name"),
                    default=Value(""),
                    output_field=CharField(),
                ),
                guardian_address=Case(
                    When(
                        guardian_info__guardian_location__isnull=False,
                        then=F("guardian_info__guardian_location"),
                    ),
                    default=F("location"),
                    output_field=CharField(),
                ),
                guardian_contact=Case(
                    When(
                        guardian_info__guardian_contact__isnull=False,
                        then=F("guardian_info__guardian_contact"),
                    ),
                    default=F("contact"),
                    output_field=CharField(),
                ),
                blood_group=bloodgroupQuery(),
            )
            .values(*student_fields)
            .first()
        )

        if _user:
            class_info = _user.pop("class_info")
            if class_info:
                class_info = self.getClassInfo(class_info)
                class_info = getClassDetails(None, False, True, False, class_info)
                _user["classname"] = class_info[0] if class_info else ""
        return _user

    def getClassInfo(self, class_info_id):
        return (
            ClassInfo.objects.filter(id=class_info_id)
            .select_related("academic_year", "section", "course")
            .first()
        )

    def getStaff(self, user_id, organization):
        staff_q = Q(id=user_id, school_id=organization)
        _user = (
            Staff.objects.filter(staff_q)
            .annotate(
                name=nameConcat(),
                birth_date=F("other_info__birth_date"),
                designation=F("role__role"),
                blood_group=bloodgroupQuery(),
            )
            .values(*staff_fields)
            .first()
        )
        return _user


class DigitalIdCodeView(SecuredAPIView):
    """The codes for the links a signed-in screen draws as QR codes: {id: code}."""

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    MAX_IDS = 500

    def get(self, request):
        school = request.query_params.get("school")
        role = request.query_params.get("role") or str(Roles["student"])
        if not (str(school).isdigit() and role.isdigit()):
            return self.RESPONSE__INVALID_REQUEST
        school, role = int(school), int(role)
        ids = [
            int(i)
            for i in (request.query_params.get("ids") or "").split(",")[: self.MAX_IDS]
            if i.strip().isdigit()
        ]
        if not school or not ids or role not in Roles.values():
            return self.RESPONSE__INVALID_REQUEST
        if role == Roles["staff"]:
            people = Staff.objects.filter(id__in=ids, school_id=school)
        else:
            people = Student.objects.filter(id__in=ids, class_info__school_id=school)
        if isinstance(request.user, StudentAccount):
            people = Student.objects.filter(account=request.user, class_info__school_id=school) if role == Roles["student"] else people.none()
        return Response(
            {pk: digital_id_code(role, school, pk) for pk in people.values_list("id", flat=True)}
        )
