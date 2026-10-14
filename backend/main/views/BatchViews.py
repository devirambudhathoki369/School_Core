"""Batch (cohort/intake) registry API.

Endpoints (under /api/v1/batches):
  GET    ?school=[&course=]   list batches (with course + start-year names)
  POST   {batch config}       create a batch
  PUT    {id, batch config}   update a batch
  DELETE ?id=&school=         soft-delete a batch (blocked if it is stamped
                              on any class or student)

A batch is a higher-education intake (bachelor / master / diploma / pre-diploma)
identified by (school, course, admission-year). This registry is purely
ADDITIVE: creating/editing a batch here touches no class, student, fee or exam
row. A batch can only be deleted while nothing references it, so historical
cohorts stay intact.
"""

from django.db import IntegrityError
from rest_framework.response import Response

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)

from ..models.Batch import Batch
from ..models.ClassInfo import ClassInfo
from ..models.Student import Student
from ..methods.referential import first_blocking_reference
from .BaseViews import SecuredAPIView

# Education levels that use a batch/cohort dimension.
HIGHER_ED_LEVELS = (4, 5, 8, 9)  # bachelor, master, pre-diploma, diploma


def _serialize_batch(row):
    return {
        "id": row["id"],
        "year": row["year"],
        "course": row["course"],
        "course_name": row["course__course"],
        "education_level": row["course__education_level"],
        "start_academic_year": row["start_academic_year"],
        "start_academic_year_name": row["start_academic_year__name"],
        "current_semester": row["current_semester"],
        "current_year": row["current_year"],
        "graduated": row["graduated"],
    }


class BatchView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )
    swagger_schema = None

    def get(self, request):
        school_id = request.query_params.get("school")
        if not school_id:
            return self.RESPONSE__INVALID_REQUEST
        qs = Batch.objects.filter(school_id=school_id, is_active=True)
        course_id = request.query_params.get("course")
        if course_id:
            qs = qs.filter(course_id=course_id)
        rows = qs.order_by("-year", "course").values(
            "id", "year", "course", "course__course",
            "course__education_level", "start_academic_year",
            "start_academic_year__name", "current_semester", "current_year",
            "graduated",
        )
        return Response([_serialize_batch(r) for r in rows])

    def post(self, request):
        data = request.data
        school_id = data.get("school")
        year = (data.get("year") or "").strip()
        if not school_id or not year:
            return self.RESPONSE__INVALID_REQUEST
        try:
            batch = Batch.objects.create(
                school_id=school_id,
                course_id=data.get("course") or None,
                year=year,
                start_academic_year_id=data.get("start_academic_year") or None,
                current_semester=data.get("current_semester") or None,
                current_year=data.get("current_year") or None,
                graduated=bool(data.get("graduated")),
            )
        except IntegrityError:
            return Response(
                {"message": "A batch for this course and admission year already exists."},
                status=409,
            )
        return Response({"message": "Batch saved!", "id": batch.id})

    def put(self, request):
        data = request.data
        batch_id = data.get("id")
        school_id = data.get("school")
        if not batch_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        batch = Batch.objects.filter(
            id=batch_id, school_id=school_id, is_active=True
        ).first()
        if not batch:
            return self.RESPONSE__NOT_FOUND
        if "course" in data:
            batch.course_id = data.get("course") or None
        if data.get("year"):
            batch.year = data.get("year").strip()
        if "start_academic_year" in data:
            batch.start_academic_year_id = data.get("start_academic_year") or None
        if "current_semester" in data:
            batch.current_semester = data.get("current_semester") or None
        if "current_year" in data:
            batch.current_year = data.get("current_year") or None
        if "graduated" in data:
            batch.graduated = bool(data.get("graduated"))
        try:
            batch.save()
        except IntegrityError:
            return Response(
                {"message": "A batch for this course and admission year already exists."},
                status=409,
            )
        return Response({"message": "Batch updated!"})

    def delete(self, request):
        batch_id = request.query_params.get("id")
        school_id = request.query_params.get("school")
        if not batch_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        batch = Batch.objects.filter(id=batch_id, school_id=school_id).first()
        if not batch:
            return self.RESPONSE__NOT_FOUND
        # A batch that is already stamped on any class or student is real,
        # referenced history — never let it be deleted.
        blocker = first_blocking_reference(
            [
                (ClassInfo.objects.filter(batch=batch_id), "classes"),
                (Student.objects.filter(batch=batch_id), "students"),
            ]
        )
        if blocker:
            return Response(
                {
                    "message": (
                        f"Cannot delete: this batch is still used by {blocker}. "
                        f"Remove or reassign them before deleting."
                    )
                },
                status=409,
            )
        batch.is_active = False
        batch.save()
        return Response({"message": "Batch deleted!"})
