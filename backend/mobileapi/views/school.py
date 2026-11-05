"""The school's notices and calendar, for everyone signed in (mobile/SPEC.md §5)."""
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from main.methods.nepaliDatetime import ndt_today
from main.methods.push import notify_school_students
from main.models.CalendarEvent import CalendarEvent
from main.models.Notice import Notice
from main.serializers.NoticeSerializer import NoticeSerializer

from ..access import PUBLISH_NOTICES, bs_date, bs_month, page_by_id, require_permission, require_role, staff_of
from ..errors import MobileError
from ..idempotency import idempotent
from ..models import AppSession
from ..profiles import _media
from .base import MobileAPIView

EVENT_TYPES = {1: "holiday", 2: "exam", 3: "result", 4: "event", 5: "vacation"}


class NoticeOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    body = serializers.CharField()
    date = serializers.CharField()
    image_url = serializers.CharField(allow_null=True)


class NoticeListOut(serializers.Serializer):
    items = NoticeOut(many=True)
    next_cursor = serializers.CharField(allow_null=True)


class NoticeIn(serializers.Serializer):
    title = serializers.CharField(min_length=2, max_length=50)
    body = serializers.CharField(min_length=2, max_length=5000)
    image = serializers.ImageField(required=False)


class CalendarEventOut(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    type = serializers.ChoiceField(choices=sorted(EVENT_TYPES.values()))
    start_date = serializers.CharField()
    end_date = serializers.CharField()


class CalendarOut(serializers.Serializer):
    start = serializers.CharField()
    end = serializers.CharField()
    items = CalendarEventOut(many=True)


def notice_payload(request, notice) -> dict:
    return {
        "id": notice.id,
        "title": notice.title,
        "body": notice.description or "",
        "date": notice.date,
        "image_url": _media(request, notice.image),
    }


def event_payload(event) -> dict:
    return {
        "id": event.id,
        "title": (event.description or "").strip() or EVENT_TYPES.get(event.type, "event").capitalize(),
        "type": EVENT_TYPES.get(event.type, "event"),
        "start_date": event.start_date,
        "end_date": event.end_date,
    }


class NoticesView(MobileAPIView):
    parser_classes = (JSONParser, MultiPartParser, FormParser)

    @extend_schema(parameters=[OpenApiParameter("cursor", str)], responses=NoticeListOut)
    def get(self, request):
        notices = Notice.objects.filter(school=request.auth.school_id, is_active=True)
        rows, cursor = page_by_id(notices, request)
        body = {"items": [notice_payload(request, n) for n in rows], "next_cursor": cursor}
        return Response(NoticeListOut(body).data)

    @extend_schema(request={"multipart/form-data": NoticeIn, "application/json": NoticeIn},
                   responses={201: NoticeOut})
    @idempotent
    def post(self, request):
        """Publish a notice: the school admin, or staff allowed to (1651)."""
        session = request.auth
        require_role(request, AppSession.ADMIN, AppSession.STAFF)
        if session.role == AppSession.STAFF:
            require_permission(staff_of(request), PUBLISH_NOTICES)
        given = NoticeIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Check the highlighted fields.", fields={
                key: str(value[0]) for key, value in given.errors.items()
            })
        data = {
            "school": session.school_id,
            "title": given.validated_data["title"],
            "description": given.validated_data["body"],
            "date": ndt_today(),
        }
        if "image" in given.validated_data:
            data["image"] = given.validated_data["image"]
        saved = NoticeSerializer(data=data)
        if not saved.is_valid():
            raise MobileError("invalid", "The notice could not be saved.", fields={
                key: str(value[0]) for key, value in saved.errors.items()
            })
        notice = saved.save()
        # The portal's push to the school's app users (NoticeView.post).
        notify_school_students(
            notice.school_id, notice.title, notice.description, image=_media(request, notice.image)
        )
        return Response(NoticeOut(notice_payload(request, notice)).data, status=status.HTTP_201_CREATED)


class CalendarView(MobileAPIView):
    @extend_schema(
        parameters=[OpenApiParameter("from", str, description="BS YYYY-MM-DD; the 1st of this month when left out"),
                    OpenApiParameter("to", str, description="BS YYYY-MM-DD; three months on when left out")],
        responses=CalendarOut,
    )
    def get(self, request):
        given_from, given_to = request.query_params.get("from"), request.query_params.get("to")
        start = bs_date(given_from, "from") if given_from else bs_month(None)["start"]
        if given_to:
            end = bs_date(given_to, "to")
        else:
            month = bs_month(start[:7])
            for _ in range(2):
                month = bs_month(month["next"])
            end = month["end"]
        if end < start:
            raise MobileError("invalid", "The end date is before the start.", fields={"to": "Before from."})
        events = CalendarEvent.objects.filter(
            school=request.auth.school_id, is_active=True, start_date__lte=end, end_date__gte=start
        ).order_by("start_date", "id")
        body = {"start": start, "end": end, "items": [event_payload(e) for e in events]}
        return Response(CalendarOut(body).data)
