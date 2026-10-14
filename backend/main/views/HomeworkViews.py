from django.db.models import Q, F, Value, CharField
from django.db.models.functions import Lower, Concat
from django.contrib.postgres.aggregates import ArrayAgg

#
from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from account.auth.UserRole import UserRoles
from .BaseViews import SecuredAPIView
from ..models.Homework import Homework, HomeworkSubmission
from ..methods.push import notify_class_students
from ..serializers.HomeworkSerializer import (
    HomeworkSerializer,
    HomeworkSubmissionSerializer,
    #
    HomeworkParamsSerializer,
    HomeworkSubmissionParamsSerializer,
    HomeworkSubmissionUpdateSerializer,
)


class HomeworkView(SecuredAPIView):
    authentication_classes = (
        StudentTokenAuthentication,
        StaffTokenAuthentication,
        AdminTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)
    include_docs = True

    @swagger_auto_schema(
        tags=["homeworks"],
        query_serializer=HomeworkParamsSerializer,
    )
    def get(self, request):
        school_id = request.query_params.get("school")
        class_info_id = request.query_params.get("class_info")
        staff_id = request.query_params.get("staff")
        subject_id = request.query_params.get("subject")
        status = request.query_params.get("status")
        status = self.getBooleanValue(status) or True
        #
        if school_id:
            q = Q(school=school_id, is_active=status)
            if class_info_id:
                q &= Q(class_info=class_info_id)
            if staff_id:
                q &= Q(staff=staff_id)
            if subject_id:
                q &= Q(subject=subject_id)
            homeworks = self.getHomeworks(q)
            return Response(homeworks)
        return self.RESPONSE__INVALID_REQUEST

    def getHomeworks(self, q):
        # staff-name?
        return (
            Homework.objects.filter(q)
            .annotate(
                files=ArrayAgg("homeworkfile__file"), subject_name=F("subject__subject")
            )
            .values("id", "subject_name", "title", "description", "due_date", "files")
        )

    @swagger_auto_schema(
        tags=["homeworks"],
        request_body=HomeworkSerializer,
    )
    def post(self, request):
        s = HomeworkSerializer(data=request.data)
        if s.is_valid():
            hw = s.save()
            # homework is class-specific — push only to that class's app users.
            notify_class_students(
                hw.school_id,
                hw.class_info_id,
                hw.title,
                hw.description,
            )
            return Response({"message": "Homewok assigned!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        tags=["homeworks"],
        operation_summary="delete by homework id",
    )
    def delete(self, request):
        # students may only view homework — never delete/close it.
        if getattr(request, "user_role", None) == UserRoles.ROLE_STUDENT:
            return Response(
                {"message": "Request denied!"}, status=status.HTTP_403_FORBIDDEN
            )
        id = request.query_params.get("id")
        if id:
            self.scope_to_caller(Homework.objects.filter(id=id), request).update(
                is_active=False
            )
            return Response({"message": "Homework closed!"})
        return self.RESPONSE__INVALID_REQUEST


class HomeworkSubmissionView(SecuredAPIView):
    authentication_classes = (
        StudentTokenAuthentication,
        StaffTokenAuthentication,
        AdminTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)
    STATUS_RECEIVED = 1
    include_docs = True
    # students hand homework in; reviewing it (PUT) stays with the teacher
    student_write_methods = ("post",)

    @swagger_auto_schema(
        tags=["homeworks"],
        query_serializer=HomeworkSubmissionParamsSerializer,
    )
    def get(self, request):
        homework_id = request.query_params.get("homework")
        student_id = request.query_params.get("student")
        status = request.query_params.get("status") or self.STATUS_RECEIVED
        q = None
        if homework_id:
            q = Q(homework=homework_id)
        elif student_id:
            q = Q(student=student_id)
        if q:
            if status:
                q &= Q(status=status)
            submissions = (
                self.scope_to_caller(
                    HomeworkSubmission.objects.filter(q), request, "homework__school"
                )
                .annotate(
                    student_name=Concat(
                        "student__first_name",
                        Value(" "),
                        "student__middle_name",
                        Value(" "),
                        "student__last_name",
                        output_field=CharField(),
                    ),
                    student_image=F("student__image"),
                    files=ArrayAgg("homeworksubmissionfile__file"),
                )
                .values(
                    "id",
                    "student_name",
                    "student_image",
                    "submitted_date",
                    "files",
                    "remarks",
                )
            )
            return Response(submissions)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        tags=["homeworks"],
        request_body=HomeworkSubmissionSerializer,
    )
    def post(self, request):
        """
        Once created/submitted, then cannot be deleted!
        """
        s = HomeworkSubmissionSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            if ins:
                return Response({"message": "Homework submitted!"})
        else:
            error = self.getSerializationError(s)
            return Response({"message": error}, status=status.HTTP_400_BAD_REQUEST)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        tags=["homeworks"],
        request_body=HomeworkSubmissionUpdateSerializer,
    )
    def put(self, request):
        id = request.data.get("id")
        status = request.data.get("status") or self.STATUS_RECEIVED
        remarks = request.data.get("remarks") or None
        if id:
            update = {"status": status, "remarks": remarks}
            self.scope_to_caller(
                HomeworkSubmission.objects.filter(id=id), request, "homework__school"
            ).update(**update)
            return Response({"message": "Submission updated!"})
        return self.RESPONSE__INVALID_REQUEST
