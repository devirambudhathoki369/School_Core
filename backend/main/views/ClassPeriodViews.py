from django.db.models import Q, Value, CharField, Case, When, IntegerField
from django.db.models.functions import Concat

#
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)

#
from .BaseViews import SecuredAPIView
from ..models.ClassPeriod import ClassPeriod
from ..models.ClassInfo import ClassInfo
from ..models.Subject import Subject
from ..models.Staff import Staff
from ..serializers.ClassPeriodSerializer import ClassPeriodSerializer
from docs.api_docs.api.manage import CLASS_PERIOD_API


class ClassPeriodView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    include_docs = True

    @swagger_auto_schema(**CLASS_PERIOD_API["get"])
    def get(self, request):
        class_info_id = request.query_params.get("class_info")
        if class_info_id:
            academic_year = request.query_params.get("academic_year")
            subjects = request.query_params.get("subjects") or False
            teachers = request.query_params.get("teachers") or False
            detailed = request.query_params.get("detailed") or False
            staff_id = request.query_params.get("staff")
            try:
                staff_id = int(staff_id)
            except:
                staff_id = None
            include_codes = request.query_params.get("include_codes") or False
            strict = False if request.query_params.get("strict") == "false" else True
            query = Q(class_info=class_info_id, is_active=True)
            RETURN_FIELDS = ("id", "period_count")
            if strict:
                if subjects:
                    RETURN_FIELDS += ("subjects",)
                if staff_id or teachers:
                    RETURN_FIELDS += ("teachers",)
                #
                if academic_year:
                    query &= Q(academic_year=academic_year)
                # Which timetable answers when the caller names no year. A
                # class is carried into the new year at close while last year's
                # ClassPeriod survives, so plain "newest by id" served last
                # year's subjects and teachers — which is how a teacher kept
                # seeing a subject they no longer teach. An earlier year's
                # timetable now answers nothing; NULL-year rows predate the
                # field and still count.
                if not academic_year:
                    class_year = (
                        ClassInfo.objects.filter(id=class_info_id)
                        .values_list("academic_year", flat=True)
                        .first()
                    )
                    if class_year:
                        query &= Q(academic_year=class_year) | Q(
                            academic_year__isnull=True
                        )
                period = (
                    ClassPeriod.objects.filter(query)
                    .values(*RETURN_FIELDS)
                    .order_by("-id")
                    .first()
                )
                if period:
                    if detailed:
                        period = self.getDetails(
                            period, subjects, teachers, staff_id, include_codes
                        )
                    return Response(period)
                else:
                    return self.RESPONSE__NOT_FOUND
            else:
                _RETURN_FIELDS = ("id", "subject")
                if include_codes:
                    _RETURN_FIELDS += ("code",)
                subjects = Subject.objects.filter(query).values(*_RETURN_FIELDS)
                return Response({"data": subjects})
        return self.RESPONSE__INVALID_REQUEST

    def getDetails(self, period, subject, teacher, staff_id, include_codes=False):
        Model, Field, DETAIL_FIELDS, data = None, None, ("id",), []
        if subject:
            Model, Field = Subject, "subjects"
            DETAIL_FIELDS += ("subject",)
            if include_codes:
                DETAIL_FIELDS += ("code",)
        if teacher:
            Model, Field = Staff, "teachers"
            DETAIL_FIELDS += ("name",)
        if Model and Field:
            subject_ids = period.get(Field) or {}
            fps = subject_ids.get("1")
            if staff_id:
                # Filter subjects by staff_id;
                staff_id = int(staff_id)
                teacher_periods = period.get("teachers") if "teachers" in period else {}
                teacher_periods = {
                    period
                    for period, teacher_id in teacher_periods.items()
                    if staff_id == teacher_id
                }
                subject_ids = {
                    subject_id
                    for period, subject_id in subject_ids.items()
                    if period in teacher_periods
                }
            else:
                subject_ids = subject_ids.values()
            """
            Model is either Staff or Subject depend on what is requested!
            """
            if subject_ids:
                data = Model.objects.filter(
                    id__in=subject_ids, is_active=True
                )  # Subject or Staff
                if teacher:
                    # concat name!
                    data = data.annotate(
                        name=Concat(
                            "first_name",
                            Value(" "),
                            "middle_name",
                            Value(" "),
                            "last_name",
                            output_field=CharField(),
                        )
                    )
                data = data.values(*DETAIL_FIELDS)
                data = [{field: e.get(field) for field in DETAIL_FIELDS} for e in data]
        return {
            "data": data,
            "fps": fps,
            "info": {"fps": "first-period-assigned-subject"},
        }

    @swagger_auto_schema(**CLASS_PERIOD_API["post"], request_body=ClassPeriodSerializer)
    def post(self, request):
        s = ClassPeriodSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Periods saved successfully!"})
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**CLASS_PERIOD_API["put"], request_body=ClassPeriodSerializer)
    def put(self, request):
        id = request.data.pop("id", None)
        class_info_id = request.data.pop("class_info", None)
        if id and class_info_id:
            instance = ClassPeriod.objects.get(id=id, class_info=class_info_id)
            if instance:
                s = ClassPeriodSerializer(
                    instance=instance, data=request.data, partial=True
                )
                if s.is_valid():
                    s.save()
                    return Response({"message": "Periods updated successfully!"})
        return self.RESPONSE__INVALID_REQUEST
