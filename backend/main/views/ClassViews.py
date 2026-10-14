from rest_framework.response import Response
from rest_framework import status

#
from django.db.models import (
    Case,
    Count,
    OuterRef,
    Q,
    Value,
    When,
    IntegerField,
    Subquery,
    Func,
    CharField,
    F,
)
from django.db import transaction
from django.db.models.functions import Coalesce
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from main.methods.getCreateClass import get_or_create_class

#
from .BaseViews import SecuredAPIView
from ..models.ClassInfo import ClassInfo
from ..models.Course import Course
from ..models.ClassPeriod import ClassPeriod
from ..serializers.ClassInfoSerializer import ClassInfoSerializer
from ..models.Fee import Fee
from ..methods.genClassname import getClassDetails
from docs.api_docs.api.manage import CLASSES_API


class AggregateJSONValues(Func):
    function = ""
    template = "(SELECT array_agg(value) FROM jsonb_each_text(%(expressions)s))"

    def __init__(self, expression, **extra):
        super().__init__(expression, output_field=CharField(), **extra)


class FirstArrayItem(Func):
    function = ""
    template = "%(expressions)s[1]"


class ClassViews(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    include_docs = True

    @swagger_auto_schema(**CLASSES_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        staff_id = request.query_params.get("staff")
        is_class_teacher = request.query_params.get("is_class_teacher")
        is_class_teacher = self.getBooleanValue(is_class_teacher)
        fees_count = request.query_params.get("fees_count") or False
        # Optional. Omitted, every class the school has is listed exactly as
        # before — the reports and pickers that read closed years depend on
        # that. Sent, only that year's classes come back, which is what a
        # marks-entry screen wants.
        academic_year = request.query_params.get("academic_year")
        if school_id:
            if "v2" in self.request.resolver_match.namespaces:
                classes = self.listClassesV2(
                    school_id, staff_id, fees_count, is_class_teacher, academic_year
                )
            else:
                classes = self.listClasses(
                    school_id, staff_id, fees_count, is_class_teacher, academic_year
                )
            return Response(classes)
        return self.RESPONSE__INVALID_REQUEST

    def listClasses(
        self, school_id, staff_id, fees_count=False, is_class_teacher=False,
        academic_year=None,
    ):
        class_infos = (
            ClassInfo.objects.filter(school=school_id, is_active=True)
            .select_related("academic_year", "section", "course")
            .order_by("id")
        )
        if academic_year:
            class_infos = class_infos.filter(academic_year=academic_year)
        if staff_id:
            class_infos = class_infos.annotate(
                teachers=self._teachersSubquery()
            ).filter(teachers__contains=staff_id)
        if fees_count:
            fees_count_subquery = (
                Fee.objects.filter(
                    class_info=OuterRef("pk"),
                    class_info__school=school_id,
                    is_active=True,
                )
                .values("class_info")
                .annotate(count=Count("pk"))
                .values("count")
            )
            class_infos = class_infos.annotate(
                fees_count=Coalesce(
                    Subquery(fees_count_subquery, output_field=IntegerField()), 0
                )
            )
        return {
            cls.id: [
                *getClassDetails(None, cls=cls),
                getattr(cls, "fees_count", 0),
                # "teachers": getattr(cls, "teachers", []),
            ]
            for cls in class_infos
        }

    def listClassesV2(
        self, school_id, staff_id, fees_count=False, is_class_teacher=False,
        academic_year=None,
    ):
        class_infos = (
            ClassInfo.objects.filter(school=school_id, is_active=True)
            .select_related("academic_year", "section", "course")
            .order_by("id")
        )
        if academic_year:
            class_infos = class_infos.filter(academic_year=academic_year)
        if staff_id:
            class_infos = class_infos.annotate(
                teachers=self._teachersSubquery(),
            ).filter(teachers__contains=staff_id)
            if is_class_teacher:
                class_infos = class_infos.annotate(
                    class_teacher=FirstArrayItem(F("teachers"))
                ).filter(class_teacher=staff_id)
        if fees_count:
            fees_count_subquery = (
                Fee.objects.filter(
                    class_info=OuterRef("pk"),
                    class_info__school=school_id,
                    is_active=True,
                )
                .values("class_info")
                .annotate(count=Count("pk"))
                .values("count")
            )
            class_infos = class_infos.annotate(
                fees_count=Coalesce(
                    Subquery(fees_count_subquery, output_field=IntegerField()), 0
                )
            )
        return [
            {
                "name": details[0],
                **details[1],
                "fees_count": getattr(cls, "fees_count", 0),
                # "teachers": getattr(cls, "teachers", []),
                # "class_teacher": getattr(cls, "class_teacher", False),
            }
            for cls in class_infos
            for details in [getClassDetails(None, cls=cls)]
        ]

    def _teachersSubquery(self):
        """Who teaches this class in the year the class is in NOW.

        A class row is not recreated at year close: AcademicYearCloseView moves
        the existing ClassInfo to the new year. Its timetable is per-year
        though, and last year's ClassPeriod survives untouched with last year's
        `teachers` map in it. This used to take the newest timetable BY ID with
        no year filter, so where a class had no timetable for the year it had
        just moved into, last year's answered — and a teacher kept the class,
        and its subjects, in Marks Entry for a year after they stopped teaching
        it. Measured on production: 393 classes across 53 schools.

        A timetable belonging to an earlier year now grants nothing. Where a
        school has not yet built this year's timetable its teachers see no
        classes, which is the truthful answer: they have no assignment this
        year until someone makes one.

        Rows predating the academic_year field carry NULL (0033 added it
        nullable and never backfilled; 58 rows across 3 schools) and are still
        honoured, so those schools are unaffected.
        """
        teacher_ids_subquery = (
            ClassPeriod.objects.filter(
                Q(class_info=OuterRef("pk"), is_active=True)
                & (
                    Q(academic_year=OuterRef("academic_year"))
                    | Q(academic_year__isnull=True)
                )
            )
            .order_by("-id")
            .annotate(teacher_ids=AggregateJSONValues(F("teachers")))
            .values("teacher_ids")[:1]
        )
        return teacher_ids_subquery

    @swagger_auto_schema(
        **CLASSES_API["post"], request_body=ClassInfoSerializer, auto_schema=None
    )
    def post(self, request):
        """
        If section is in request.data, someone is creating class with section.
            so, find class with section__isnull=False to check if it exists or not!
        else if section is not in request.data, someone is just creating class.
            so, find class with section__isnull=True to check!
        means section__isnull : [section in data = False, section not in data = True]
        """
        mismatch = self.streamFacultyMismatch(request.data)
        if mismatch:
            return Response({"message": mismatch}, status=400)
        cls, created = get_or_create_class(class_info_data=request.data)
        if cls:
            if created:
                return Response({"message": "Class saved!"})
            elif not created:
                return Response({"message": "Class already exists"}, status=404)
        return self.RESPONSE__INVALID_REQUEST

    @staticmethod
    def streamFacultyMismatch(data):
        """A +2 stream belongs to one faculty — refuse Education ▸ <a
        Management stream>. A stream with no faculty yet is refused too: the
        school sets it in Course setup first."""
        course_id = data.get("course")
        if data.get("education_level") not in (3, "3") or not course_id:
            return None
        course = Course.objects.filter(id=course_id).only("faculty", "education_level").first()
        if not course or course.education_level != 3:
            return None
        if not course.faculty:
            return "Set this stream's faculty in Course setup first."
        if str(course.faculty) != str(data.get("faculty")):
            return "This stream belongs to another faculty."
        return None

    UPDATE_ALLOWED_ROLES = ("superuser",)

    @swagger_auto_schema(tags=["classes"], auto_schema=None)
    def put(self, request):
        user_role = getattr(request, "user_role", None)
        if user_role not in self.UPDATE_ALLOWED_ROLES:
            return Response(
                {"message": "Request denied!"}, status=status.HTTP_403_FORBIDDEN
            )
        school_id = request.data.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        update_periods = request.data.pop("update_periods", False)
        update_periods = self.getBooleanValue(update_periods)
        data = request.data.pop("data", [])
        status = self.updateAcademicYears(data, update_periods)
        if status:
            return Response({"message": "Update successfull!"})

    def updateAcademicYears(self, data, update_periods=False):
        """update class-infos academic years!"""
        data = {e.get("id"): e.get("academic_year") for e in data}
        with transaction.atomic():
            class_ids = data.keys()
            classes = ClassInfo.objects.filter(id__in=class_ids).select_for_update()
            for cls in classes:
                clsId = cls.id
                academic_year = data.get(clsId)
                setattr(cls, "academic_year_id", academic_year)
            ClassInfo.objects.bulk_update(classes, ["academic_year"])
            if update_periods:
                periods = ClassPeriod.objects.filter(
                    class_info__in=class_ids
                ).select_for_update()
                for period in periods:
                    clsId = period.class_info.id
                    setattr(period, "academic_year_id", data.get(clsId) or None)
                ClassPeriod.objects.bulk_update(periods, ["academic_year"])
            return True
        return False
