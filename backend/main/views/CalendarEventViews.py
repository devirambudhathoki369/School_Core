from django.db.models import Q

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from drf_yasg.utils import swagger_auto_schema
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)
from customs.Extract import ExtractMonth, ExtractYear
import nepali_datetime


#
from .BaseViews import SecuredAPIView
from ..models.CalendarEvent import CalendarEvent
from ..serializers.CalendarEventSerializer import (
    CalendarEventSerializer,
    CalendarEventParamsSerializer,
)

DOCS_TAGS = ["calendar events"]
CALENDAR_EVENT_RETURN_FIELDS = (
    "id",
    "start_date",
    "end_date",
    "type",
    "color",
    "description",
)


class CalendarEventsPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class CalendarEventView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    include_docs = True

    @swagger_auto_schema(tags=DOCS_TAGS, request_body=CalendarEventSerializer)
    def post(self, request):
        serializer = CalendarEventSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "Event saved!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=DOCS_TAGS, query_serializer=CalendarEventParamsSerializer)
    def get(self, request):
        calendar = request.query_params.get("calendar")
        calendar = self.getBooleanValue(calendar)
        if calendar:
            return self.getCalendar()
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        page = request.query_params.get("page")
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")
        year = request.query_params.get("year")
        month = request.query_params.get("month")
        monthly = bool(year) and bool(month)
        if school_id:
            query = Q(school=school_id, is_active=True)
            if id:
                query &= Q(id=id)
            # TODO: implement filter by date!
            events = CalendarEvent.objects.filter(query).only(
                *CALENDAR_EVENT_RETURN_FIELDS
            )
            if monthly:
                q = Q(start_year=year) | Q(end_year=year)
                q &= Q(start_month=month) | Q(end_month=month)
                events = events.annotate(
                    start_year=ExtractYear("start_date"),
                    end_year=ExtractYear("end_date"),
                    start_month=ExtractMonth("start_date"),
                    end_month=ExtractMonth("end_date"),
                ).filter(q)
                serializer = CalendarEventSerializer(events, many=True)
                return Response(serializer.data)
            else:
                paginator = CalendarEventsPagination()
                events = paginator.paginate_queryset(events, request)
                serializer = CalendarEventSerializer(events, many=True)
                return paginator.get_paginated_response(serializer.data)
        return self.RESPONSE__INVALID_REQUEST

    def getCalendar(self):
        # nepali_datetime.date(2081, 1, 1).calendar()
        return Response(
            {
                "calendar": nepali_datetime._CALENDAR,
                "MINYEAR": nepali_datetime.MINYEAR,
                "MAXYEAR": nepali_datetime.MAXYEAR,
                "DAYS_BEFORE_YEAR": nepali_datetime._DAYS_BEFORE_YEAR,
            }
        )

    @swagger_auto_schema(tags=DOCS_TAGS, request_body=CalendarEventSerializer)
    def put(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        if id and school_id:
            instance = CalendarEvent.objects.get(id=id, school=school_id)
            if instance:
                serializer = CalendarEventSerializer(
                    instance, data=request.data, partial=True
                )
                if serializer.is_valid():
                    serializer.save()
                    return Response({"message": "Event updated!"})
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=DOCS_TAGS)
    def delete(self, request):
        id = request.query_params.get("id")
        if id:
            instance = CalendarEvent.objects.get(id=id)
            if instance:
                instance.is_active = False
                instance.save()
                return Response({"message": "Event deleted!"})
        return self.RESPONSE__INVALID_REQUEST
