from django.db.models import Q
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.exams.Schedule import ExamSchedule
from ...serializers.exams.ScheduleSerializer import ExamScheduleSerializer
from docs.api_docs.api.exam_results import EXAM_SCHEDULE_API


class ExamScheduleView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    @swagger_auto_schema(**EXAM_SCHEDULE_API["get"])
    def get(self, request):
        id = request.query_params.get("id")
        school_id = request.query_params.get("school")
        class_info_id = request.query_params.get("class_info")
        exam_id = request.query_params.get("exam")
        status = request.query_params.get("status") or True
        query = None
        if school_id:
            query = Q(class_info__school=school_id)
        if class_info_id:
            query = self.getClassInfoQuery(class_info_id, True)
            if exam_id:
                query &= Q(exam=exam_id)
        if id:
            query = Q(id=id)
        if query:
            data = (
                ExamSchedule.objects.filter(query, is_active=status)
                .order_by("-id")
                .values(
                    "id", "exam", "schedule", "start_time", "end_time", "class_info"
                )
            )
            if class_info_id:
                data = data.first()
                # print(data)
            return Response(data)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **EXAM_SCHEDULE_API["post"], request_body=ExamScheduleSerializer
    )
    def post(self, request):
        s = ExamScheduleSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Exam schedule saved!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **EXAM_SCHEDULE_API["put"], request_body=ExamScheduleSerializer
    )
    def put(self, request):
        id = request.data.pop("id")
        class_info_id = request.data.pop("class_info")
        if id and class_info_id:
            schedule = ExamSchedule.objects.get(id=id, class_info=class_info_id)
            s = ExamScheduleSerializer(schedule, data=request.data, partial=True)
            if s.is_valid():
                s.save()
                return Response({"message": "Exam schedule updated!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**EXAM_SCHEDULE_API["delete"])
    def delete(self, request):
        id = request.query_params.get("id")
        class_info_id = request.query_params.get("class_info")
        if id and class_info_id:
            schedule = ExamSchedule.objects.get(id=id, class_info=class_info_id)
            if schedule:
                schedule.is_active = False
                schedule.save()
                return Response({"message": "Delete completed!"})
        return self.RESPONSE__INVALID_REQUEST
