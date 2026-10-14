from rest_framework.response import Response
from django.db.models import Q

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.exams.SubjectAssignment import SubjectAssignment
from ...serializers.exams.SubjectAssignmentSerializer import SubjectAssignmentSerializer


class OptionalSubjectAssignmentView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    swagger_schema = None

    def get(self, request):
        school_id = request.query_params.get("school")
        academic_year = request.query_params.get("academic_year")
        class_info_id = request.query_params.get("class")
        subject_id = request.query_params.get("subject")
        q = Q()
        if school_id and academic_year:
            q &= Q(school=school_id, academic_year=academic_year)
            if class_info_id and subject_id:
                q &= Q(class_info=class_info_id, subject=subject_id)
                item = (
                    SubjectAssignment.objects.filter(q).values("id", "students").first()
                )
                if item:
                    return Response(item)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = SubjectAssignmentSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Optional Subject assignment completed!"})
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            item = SubjectAssignment.objects.get(id=id, school=school_id)
            if item:
                s = SubjectAssignmentSerializer(item, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Optional Subject assignment updated!"})
        return self.RESPONSE__INVALID_REQUEST
