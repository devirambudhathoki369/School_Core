from django.db.models import Q
from django.db import transaction
from django.utils import timezone
from rest_framework.response import Response
from drf_yasg.utils import swagger_auto_schema

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from ..BaseViews import SecuredAPIView
from ...models.exams.ExtraActivity import ExtraActivity, ExtraActivityEntry
from ...serializers.exams.ExtraActivitySerializer import (
    ExtraActivitySerializer,
    ExtraActivityEntrySerializer,
)
from docs.api_docs.api.manage import EXTRA_ACTIVITIES_API
from docs.api_docs.api.exam_results import EXTRA_ACTIVITIES_ENTRY_API


def owns_rows(view, Model, rows):
    """
    True when every row that names an `id` names one of the caller's own.

    Rows with an id are saved by `bulk_update`, which matches on the id alone
    -- so a POST could rename another school's activities or rewrite its
    students' extra-activity results, which print on their marksheets.
    """
    ids = {row.get("id") for row in rows if row.get("id")}
    if not ids:
        return True
    owned = view.scope_to_caller(Model.objects.filter(id__in=ids), view.request)
    return owned.count() == len(ids)


class ExtraActivityView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    @swagger_auto_schema(**EXTRA_ACTIVITIES_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            q = Q(school=school_id)
            id = request.query_params.get("id")
            if id:
                q &= Q(id=id)
            items = ExtraActivity.objects.filter(q).values("id", "name")
            return Response(items)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **EXTRA_ACTIVITIES_API["post"], request_body=ExtraActivitySerializer
    )
    def post(self, request):
        isList = isinstance(request.data, list)
        s = ExtraActivitySerializer(data=request.data, many=isList)
        if s.is_valid():
            data = self.handle_save(s.validated_data)  # return [{id,name}, ...]
            if data:
                return Response({"message": "Extra activities saved!", "data": data})
        return self.RESPONSE__INVALID_REQUEST

    def handle_save(self, data):
        if not owns_rows(self, ExtraActivity, data):
            return None
        ret_data = []
        to_create, to_update = [], []
        updated_at = timezone.now()
        for e in data:
            id = e.get("id")
            if id:
                to_update.append(ExtraActivity(**e, updated_at=updated_at))
                ret_data.append({"id": id, "name": e.get("name")})
            else:
                to_create.append(ExtraActivity(**e))
        with transaction.atomic():
            if len(to_create):
                instances = ExtraActivity.objects.bulk_create(to_create)
                for e in instances:
                    ret_data.append({"id": e.id, "name": e.name})
            if len(to_update):
                ExtraActivity.objects.bulk_update(to_update, ("name", "updated_at"))
            return ret_data

    @swagger_auto_schema(
        **EXTRA_ACTIVITIES_API["put"], request_body=ExtraActivitySerializer
    )
    def put(self, request):
        id = request.data.pop("id")
        school_id = request.data.pop("school")
        if id:
            q = Q(id=id)
            if school_id:
                q &= Q(school=school_id)
            #
            # `school` is optional in this payload, so the id alone used to
            # reach any school's activity
            item = self.scope_to_caller(ExtraActivity.objects.filter(q), request).first()
            if item:
                s = ExtraActivitySerializer(item, request.data, partial=True)
                if s.is_valid():
                    s.save()
                    return Response({"message": "Extra activities updated!"})
        return self.RESPONSE__INVALID_REQUEST


class ExtraActivityEntryView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    @swagger_auto_schema(**EXTRA_ACTIVITIES_ENTRY_API["get"])
    def get(self, request):
        school_id = request.query_params.get("school")
        exam_id = request.query_params.get("exam")
        if school_id and exam_id:
            q = Q(school=school_id, exam=exam_id)
            class_info_id = request.query_params.get("class_info")
            if class_info_id:
                q &= Q(student__class_info=class_info_id)
            entries = ExtraActivityEntry.objects.filter(q).values(
                "id", "student", "extra_activities"
            )
            return Response({"entries": entries})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(
        **EXTRA_ACTIVITIES_ENTRY_API["post"], request_body=ExtraActivityEntrySerializer
    )
    def post(self, request):
        isList = isinstance(request.data, list)
        s = ExtraActivityEntrySerializer(data=request.data, many=isList)
        if s.is_valid():
            data = self.handle_save(s.validated_data)
            if data:
                return Response(
                    {"message": "Students extra activities saved!", "data": data}
                )
        return self.RESPONSE__INVALID_REQUEST

    def handle_save(self, data):
        if not owns_rows(self, ExtraActivityEntry, data):
            return None
        ret_data = []
        to_create, to_update = [], []
        updated_at = timezone.now()
        for e in data:
            id = e.get("id")
            if id:
                to_update.append(ExtraActivityEntry(**e, updated_at=updated_at))
                ret_data.append(
                    {
                        "id": id,
                        "student": e.get("student"),
                        "extra_activities": e.get("extra_activities"),
                    }
                )
            else:
                to_create.append(ExtraActivityEntry(**e))
        with transaction.atomic():
            if len(to_create):
                instances = ExtraActivityEntry.objects.bulk_create(to_create)
                for e in instances:
                    ret_data.append(
                        {
                            "id": e.id,
                            "student": e.student.id,
                            "extra_activities": e.extra_activities,
                        }
                    )
            if len(to_update):
                ExtraActivityEntry.objects.bulk_update(
                    to_update, ("extra_activities", "updated_at")
                )
            return ret_data
