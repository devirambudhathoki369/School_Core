from django.db.models import Q, Case, When, F, Value, CharField
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from main.methods.nameConcat import nameConcat
from ..models.Attendance import RFIDAttdLogs
from .Roles import Roles


class AttdLogsCursorPagination(CursorPagination):
    page_size = 20
    ordering = "-punch_time"


class AttdLogsView(SecuredAPIView):
    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)

    def get(self, request):
        school_id = request.query_params.get("school")
        device_id = request.query_params.get("device")
        role = request.query_params.get("role")
        if school_id:
            q = Q(user__device__school_id=school_id)
            if device_id:
                q &= Q(user__device_id=device_id)

            _name_field = ""
            if role == Roles.STUDENT:
                _name_field = "user__student"
                q &= Q(user__student__isnull=False)
            elif role == Roles.STAFF:
                _name_field = "user__staff"
                q &= Q(user__staff__isnull=False)

            logs_q = (
                RFIDAttdLogs.objects.select_related("user")
                .filter(q)
                .annotate(
                    status_label=Case(
                        When(status=0, then=Value("Check In")),
                        When(status=1, then=Value("Check Out")),
                        When(status=2, then=Value("Break Out")),
                        When(status=3, then=Value("Break In")),
                        When(status=4, then=Value("OT In")),
                        When(status=5, then=Value("OT Out")),
                        When(status=255, then=Value("Punch")),
                        default=Value("Unknown"),
                        output_field=CharField(),
                    ),
                    user_name=nameConcat(_name_field),
                )
                .order_by("-punch_time")
                .values(
                    "id",
                    "punch_time",
                    "status_label",
                    "user_name",
                )
            )
            paginator = AttdLogsCursorPagination()
            logs = paginator.paginate_queryset(logs_q, request)
            return paginator.get_paginated_response(logs)
        return self.RESPONSE__INVALID_REQUEST
