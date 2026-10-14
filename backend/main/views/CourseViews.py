from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..models.Course import Course
from ..models.ClassInfo import ClassInfo
from ..models.Batch import Batch
from ..methods.referential import first_blocking_reference
from ..serializers.CourseSerializer import CourseSerializer, first_error
from .BaseViews import SecuredAPIView

#
from rest_framework.response import Response


class CourseView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    swagger_schema = None

    def get(self, request):
        school_id = request.query_params.get("school", None)
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        items = Course.objects.filter(school__id=school_id, is_active=True).values(
            "id", "education_level", "course", "total_years", "total_semesters", "faculty"
        )
        s = CourseSerializer(items, many=True)
        return Response(s.data)

    def post(self, request):
        s = CourseSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Saved successfully!"})
        return Response({"message": first_error(s.errors)}, status=400)

    def put(self, request):
        course_id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if not course_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        course = Course.objects.get(id=course_id, school__id=school_id)
        if not course:
            return self.RESPONSE__INVALID_REQUEST
        s = CourseSerializer(course, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Update compeleted!"})
        return Response({"message": first_error(s.errors)}, status=400)

    def delete(self, request):
        course_id = request.query_params.get("id", None)
        school_id = request.query_params.get("school", None)
        if not course_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        course = Course.objects.get(id=course_id, school__id=school_id)
        # don't delete a course that ANY class OR batch is built on — including
        # soft-deleted (historical) ones. No is_active filter: once a course is
        # used/assigned anywhere, ever, it must stay. Matches the Subject rule.
        # (Course has two CASCADE FKs — ClassInfo.course and Batch.course — both
        # must be checked, or deleting would orphan/cascade the missed one.)
        blocker = first_blocking_reference(
            [
                (ClassInfo.objects.filter(course=course_id), "classes"),
                (Batch.objects.filter(course=course_id), "batches"),
            ]
        )
        if blocker:
            return Response(
                {
                    "message": (
                        f"Cannot delete: this course is still used by "
                        f"{blocker}. Remove or reassign them before deleting."
                    )
                },
                status=409,
            )
        course.is_active = False
        course.save()
        return Response({"message": "Delete completed!"})
