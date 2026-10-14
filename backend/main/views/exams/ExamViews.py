from django.db.models import Q, F

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
from ...models.exams.Exam import Exam
from ...serializers.exams.ExamSerializer import ExamSerializer
from ..BaseViews import SecuredAPIView

from docs.api_docs.api.exam_results import EXAMS_API


#
class ExamView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    @swagger_auto_schema(**EXAMS_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        acay = request.query_params.get("academic_year")
        id = request.query_params.get("id")
        as_options = request.query_params.get("as_options")
        if school_id:
            q = Q(school=school_id, is_active=True)
            if acay:
                q &= Q(academic_year=acay)
                if id:
                    q = Q(id=id)
            #
            RETURN_FIELDS = ("id", "name")
            # if not as_options:
            data = Exam.objects.filter(q)
            if not as_options:
                RETURN_FIELDS += (
                    "inclusion",
                    "attendance_inclusion",
                    "academic_year",
                    "academic_year_str",
                )
                data = data.annotate(academic_year_str=F("academic_year__name"))
            data = data.values(*RETURN_FIELDS).order_by("id")
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST

    def getExam(self, instance):
        return {
            "id": instance.id,
            "name": instance.name,
            "academic_year": instance.academic_year.id,
            "academic_year_str": instance.academic_year.name,
            "inclusion": instance.inclusion,
            "attendance_inclusion": instance.attendance_inclusion,
            "attendance_inclusion_str": (
                "Yes" if instance.attendance_inclusion is True else "No"
            ),
        }

    @swagger_auto_schema(**EXAMS_API["post"], request_body=ExamSerializer)
    def post(self, request):
        s = ExamSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Exam saved!",
                    "exam": self.getExam(ins),
                }
            )
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**EXAMS_API["put"], request_body=ExamSerializer)
    def put(self, request):
        exam_id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if exam_id and school_id:
            exam = Exam.objects.get(id=exam_id, school=school_id)
            if exam:
                s = ExamSerializer(exam, data=request.data, partial=True)
                if s.is_valid():
                    ins = s.save()
                    return Response(
                        {
                            "message": "Exam updated!",
                            "exam": self.getExam(ins),
                        }
                    )
        return self.RESPONSE__INVALID_REQUEST

    # @swagger_auto_schema(**EXAMS_API["delete"])
    # def delete(self, request):
    #     exam_id = request.query_params.get("id", None)
    #     school_id = request.query_params.get("school", None)
    #     if exam_id and school_id:
    #         exam = Exam.objects.get(id=exam_id, school=school_id)
    #         if exam:
    #             exam.is_active = False
    #             exam.save()
    #             return Response({"message": "Delete completed!"})
    #     return self.RESPONSE__INVALID_REQUEST
