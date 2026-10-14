from rest_framework.response import Response
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.pagination import CursorPagination

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StudentTokenAuthentication,
    StaffTokenAuthentication,
)
from .BaseViews import SecuredAPIView
from ..models.NewsEvent import NewsEvent
from ..methods.push import notify_school_students
from ..serializers.NewsEventSerializer import (
    NewsEventSerializer,
    NewsEventImageSerializer,
    #
    NewsEventsParamsSerializer,
)

from drf_yasg.utils import swagger_auto_schema

TAGS = ["news events"]


class NewsEventCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class NewsEventView(SecuredAPIView):
    authentication_classes = (
        StaffTokenAuthentication,
        StudentTokenAuthentication,
        AdminTokenAuthentication,
    )
    parser_classes = (JSONParser, MultiPartParser)
    include_docs = True
    _fields = ["id", "title", "school"]

    @swagger_auto_schema(tags=TAGS, query_serializer=NewsEventsParamsSerializer)
    def get(self, request):
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        include_content = request.query_params.get("include_content")
        include_content = self.getBooleanValue(include_content)
        if school_id:
            items = NewsEvent.objects.filter(school=school_id).values(*self._fields)
            if id:
                items = items.filter(id=id).first()
            if include_content:
                item = items.values(*self._fields, "content")
                if item:
                    return Response(item)
                else:
                    return self.RESPONSE__NOT_FOUND
            else:
                paginator = NewsEventCursorPagination()
                items = paginator.paginate_queryset(items, request)
                return paginator.get_paginated_response(items)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=TAGS, request_body=NewsEventSerializer)
    def post(self, request):
        serializer = NewsEventSerializer(data=request.data)
        if serializer.is_valid():
            ins = serializer.save()
            # background push to the school's app users.
            notify_school_students(
                ins.school_id,
                ins.title,
                ins.content,
                notif_type="news",
            )
            return Response(
                {
                    "message": "News Saved!",
                    # "news": self.getNews(ins),
                }
            )
        # else:
        #     print(serializer.errors)
        return self.RESPONSE__INVALID_REQUEST

    @swagger_auto_schema(tags=TAGS, request_body=NewsEventSerializer)
    def put(self, request):
        school_id = request.data.get("school")
        if "image" in request.data and school_id:
            imageSerializer = NewsEventImageSerializer(data=request.data)
            if imageSerializer.is_valid():
                ins = imageSerializer.save()
                return Response({"image": ins.image.url if ins.image else None})
        else:
            id = request.data.get("id")
            instance = NewsEvent.objects.get(id=id, school=school_id)
            serializer = NewsEventSerializer(
                instance=instance, data=request.data, partial=True
            )
            if serializer.is_valid():
                ins = serializer.save()
                return Response(
                    {
                        "message": "News updated!",
                        "news": self.getNews(ins),
                    }
                )
        return self.RESPONSE__INVALID_REQUEST

    def getNews(self, instance):
        return {
            "title": instance.title,
            "content": instance.content,
            "school": instance.school_id,
        }

    @swagger_auto_schema(tags=TAGS)
    def delete(self, request):
        return Response({})
