from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from ..models.Student import StudentMedicalInfo
from ..serializers.StudentSerializer import StudentMedicalInfoSerializer
from .BaseViews import SecuredAPIView


"""
-/api/students/medical
GET    ?student=&school=        → return the student's medical record (or empty {} if none).
POST   { student, school, ... } → create the medical record (one per student).
PUT    { id, student, school, ... } → update an existing record (partial allowed).
DELETE ?id=&student=&school=    → soft-delete (is_active=False).
"""

MEDICAL_RETURN_FIELDS = (
    "id",
    "has_chronic_illness",
    "chronic_illness_details",
    "allergies",
    "previous_surgeries",
    "physical_disability",
    "has_vision_problem",
    "vision_problem_details",
    "has_hearing_problem",
    "hearing_problem_details",
    "current_medication",
    "remarks",
    "is_active",
    "updated_at",
)


class StudentMedicalInfoView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    def get(self, request):
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        if not student_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        record = (
            StudentMedicalInfo.objects.filter(
                student=student_id, school=school_id, is_active=True
            )
            .values(*MEDICAL_RETURN_FIELDS)
            .first()
        )
        return Response(record or {})

    def post(self, request):
        student_id = request.data.get("student")
        school_id = request.data.get("school")
        if not student_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        # OneToOne enforces "one row per student" — if a soft-deleted record
        # exists, reactivate + overwrite it (so Delete → Save again works).
        # If an ACTIVE record exists, return 409 and let the client switch to PUT.
        existing = StudentMedicalInfo.objects.filter(
            student=student_id, school=school_id
        ).first()
        if existing and existing.is_active:
            return self.RESPONSE__ALREADY_EXISTS
        if existing and not existing.is_active:
            data = dict(request.data)
            data["is_active"] = True
            s = StudentMedicalInfoSerializer(existing, data=data, partial=True)
            if s.is_valid():
                s.save()
                return Response({"message": "Medical record saved!", "record": s.data})
            return Response({"message": "Invalid data!", "errors": s.errors}, status=400)
        s = StudentMedicalInfoSerializer(data=request.data)
        if s.is_valid():
            s.save()
            return Response({"message": "Medical record saved!", "record": s.data})
        return Response({"message": "Invalid data!", "errors": s.errors}, status=400)

    def put(self, request):
        record_id = request.data.pop("id", None)
        student_id = request.data.get("student")
        school_id = request.data.get("school")
        if not record_id or not student_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        instance = StudentMedicalInfo.objects.filter(
            id=record_id, student=student_id, school=school_id
        ).first()
        if not instance:
            return self.RESPONSE__NOT_FOUND
        s = StudentMedicalInfoSerializer(instance, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            return Response({"message": "Medical record updated!", "record": s.data})
        return Response({"message": "Invalid data!", "errors": s.errors}, status=400)

    def delete(self, request):
        record_id = request.query_params.get("id")
        student_id = request.query_params.get("student")
        school_id = request.query_params.get("school")
        if not record_id or not student_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        instance = StudentMedicalInfo.objects.filter(
            id=record_id, student=student_id, school=school_id
        ).first()
        if not instance:
            return self.RESPONSE__NOT_FOUND
        instance.is_active = False
        instance.save(update_fields=["is_active", "updated_at"])
        return Response({"message": "Medical record removed!"})
