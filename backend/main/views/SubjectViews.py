from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
    StudentTokenAuthentication,
)
from ..models.Subject import Subject
from ..models.ClassPeriod import ClassPeriod
from ..models.Homework import Homework
from ..models.Staff import Staff
from ..models.exams.Result import ClassResult
from ..models.exams.SubjectAssignment import SubjectAssignment
from ..methods.referential import first_blocking_reference
from ..serializers.SubjectSerializer import SubjectSerializer
from .BaseViews import SecuredAPIView
from docs.api_docs.api.manage import SUBJECTS_API

#
from django.db import transaction
from django.db.models import Q
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema


class SubjectView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
        StudentTokenAuthentication,
    )

    @swagger_auto_schema(**SUBJECTS_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        as_options = request.query_params.get("as_options") or False
        optional = request.query_params.get("optional") or False
        credit_hours = request.query_params.get("credit_hours") or False
        class_info = request.query_params.get("class_info") or None
        if school_id:
            RETURN_FIELDS = ("id", "subject", "subject_pr")
            if not as_options:
                RETURN_FIELDS += (
                    "code",
                    "type",
                    "credit_hours",
                    "code_pr",
                    "credit_hours_pr",
                    "order",
                )
            if credit_hours:
                RETURN_FIELDS += (
                    "credit_hours",
                    "credit_hours_pr",
                )
            #
            query = Q(school=school_id, is_active=True)
            if class_info:
                query &= self.getClassInfoQuery(class_info)
            if optional:
                OPTIONAL_SUBJECT = 2
                query &= Q(type=OPTIONAL_SUBJECT)
            #
            items = (
                Subject.objects.filter(query).values(*RETURN_FIELDS).order_by("order")
            )
            return Response(items)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**SUBJECTS_API["post"], request_body=SubjectSerializer)
    def post(self, request):
        s = SubjectSerializer(data=request.data)
        if s.is_valid():
            ins = s.save()
            return Response(
                {
                    "message": "Saved successfully!",
                    "subject": {"id": ins.id},
                }
            )
        # else:
        #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(**SUBJECTS_API["put"], request_body=SubjectSerializer)
    def put(self, request):
        subject_id = request.data.pop("id", None)
        school_id = request.data.pop("school", None)
        if subject_id and school_id:
            subject = Subject.objects.get(id=subject_id, school=school_id)
            if subject:
                s = SubjectSerializer(subject, data=request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Update compeleted!"})
                # else:
                #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def delete(self, request):
        # Subject deletion is ENABLED but strictly guarded. A subject whose FKs are
        # all on_delete=CASCADE must NEVER be deletable while referenced, or the
        # delete would wipe historical marksheets (results/homework/assignments).
        # Rule (user: "if used anywhere it shouldn't get deleted"):
        #   • is_protected            -> 409 (curriculum lock, never deletable)
        #   • referenced by any FK    -> 409 (used anywhere -> blocked)
        #   • otherwise (unreferenced)-> soft-delete (is_active=False) and unlink from
        #                                non-closed class routines. Reversible.
        subject_id = request.query_params.get("id", None)
        school_id = request.query_params.get("school", None)
        if not subject_id or not school_id:
            return self.RESPONSE__INVALID_REQUEST
        subject = Subject.objects.get(id=subject_id, school__id=school_id)
        # Hard lock: a protected subject can NEVER be deleted, even with no references.
        if subject.is_protected:
            return Response(
                {
                    "message": (
                        "Cannot delete: this subject is protected and cannot be "
                        "removed. Unprotect it first if deletion is truly intended."
                    )
                },
                status=409,
            )
        # Block if used/assigned ANYWHERE — results, exam setups, homework, or teacher
        # assignments. We intentionally do NOT filter references by is_active: even a
        # soft-deleted result still means the subject was used and must be preserved.
        blocker = first_blocking_reference(
            [
                (ClassResult.objects.filter(subject=subject_id), "exam results"),
                (SubjectAssignment.objects.filter(subject=subject_id), "exam setups"),
                (Homework.objects.filter(subject=subject_id), "homework"),
                (
                    Staff.objects.filter(
                        Q(primary_subject=subject_id)
                        | Q(secondary_subject=subject_id),
                    ),
                    "teacher assignments",
                ),
            ]
        )
        if blocker:
            return Response(
                {
                    "message": (
                        f"Cannot delete: this subject is still used by {blocker}. "
                        f"Remove or reassign them before deleting."
                    )
                },
                status=409,
            )
        # Unreferenced -> safe to soft-delete. Also unlink it from non-closed class
        # routines so it leaves the current setup without dangling in the routine JSON.
        sid = int(subject_id)
        with transaction.atomic():
            subject.is_active = False
            subject.save(update_fields=["is_active"])
            periods = ClassPeriod.objects.filter(
                class_info__school_id=school_id
            ).select_related("academic_year")
            for period in periods:
                ay = period.academic_year
                if ay is not None and ay.closed:
                    continue  # never touch closed years
                subjects_map = period.subjects or {}
                if not isinstance(subjects_map, dict):
                    continue
                pruned = {
                    slot: val
                    for slot, val in subjects_map.items()
                    if int(val) != sid
                }
                if len(pruned) != len(subjects_map):
                    period.subjects = pruned
                    period.save(update_fields=["subjects"])
        return Response({"message": "Delete completed!"})
