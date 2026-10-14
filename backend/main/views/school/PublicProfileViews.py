from django.db.models import Q, CharField, Case, When, F, Value
from django.db.models.functions import Coalesce

#
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.throttling import SimpleRateThrottle, AnonRateThrottle
from django.conf import settings

#
from main.methods.bloodgroupQuery import bloodgroupQuery
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student
from main.models.Staff import Staff
from main.models.ClassInfo import ClassInfo
from main.methods.nameConcat import nameConcat
from main.methods.genClassname import getClassDetails

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
