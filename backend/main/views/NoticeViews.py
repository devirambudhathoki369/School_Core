from django.conf import settings
from django.db.models import Q

#
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework.parsers import JSONParser, MultiPartParser

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)

#
from ..models.Notice import Notice
from .BaseViews import SecuredAPIView
from ..serializers.NoticeSerializer import NoticeSerializer
from ..methods.push import notify_school_students


class NoticeCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


def _absolute_image(request, path):
    """A fully-qualified URL for a notice image, or None.

    The mobile app has no idea what host the backend is on, and a push
    notification is rendered by the OS with no app context at all, so a relative
    `/media/...` path is useless to both. `.values()` hands back the raw stored
    path rather than a URL, so the `MEDIA_URL` prefix is added here.
    """
    if not path:
        return None
    if not str(path).startswith(settings.MEDIA_URL):
        path = f"{settings.MEDIA_URL}{path}"
    return request.build_absolute_uri(path)


class NoticeView(SecuredAPIView):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )
    # A notice can carry a picture, so the create/edit paths have to accept a
    # file upload. `SecuredAPIView` is JSON-only by default, which silently
    # rejected multipart.
    parser_classes = (JSONParser, MultiPartParser)

    def get(self, request):
        school_id = request.query_params.get("school")
        if school_id:
            id = request.query_params.get("id")
            q = Q(school=school_id, is_active=True)
            if id:
                q &= Q(id=id)
            notices = Notice.objects.filter(q).values(
                "id", "title", "description", "date", "image"
            )
            paginator = NoticeCursorPagination()
            page = paginator.paginate_queryset(notices, request)
            # The column has existed since the model was written but was never
            # listed here, so every client — the app included — was served a
            # notice that could not show its own picture.
            for notice in page:
                notice["image"] = _absolute_image(request, notice["image"])
            return paginator.get_paginated_response(page)
        return self.RESPONSE__INVALID_REQUEST

    def post(self, request):
        s = NoticeSerializer(data=request.data)
        if s.is_valid():
            notice = s.save()
            # push to the school's app users in the background, so the admin's
            # save responds instantly and a big school can't time out.
            notify_school_students(
                notice.school_id,
                notice.title,
                notice.description,
                image=_absolute_image(request, notice.image.name if notice.image else None),
            )
            return Response({"message": "Notice saved!"})
        return self.RESPONSE__INVALID_REQUEST

    def put(self, request):
        """Edit a published notice. Does NOT re-push (avoids re-notifying users)."""
        school_id = request.data.get("school")
        id = request.data.get("id")
        if school_id and id:
            notice = Notice.objects.filter(
                id=id, school=school_id, is_active=True
            ).first()
            if notice:
                s = NoticeSerializer(instance=notice, data=request.data, partial=True)
                if s.is_valid():
                    notice = s.save()
                    # Taking the picture off has to be said explicitly. A
                    # partial update that simply omits `image` means "leave it
                    # alone", which is what an edit of only the title should do —
                    # so there is no other way to express "remove it".
                    if str(request.data.get("remove_image", "")).lower() in ("1", "true", "yes"):
                        notice.image.delete(save=True)
                    return Response(
                        {
                            "message": "Notice updated!",
                            "image": _absolute_image(
                                request, notice.image.name if notice.image else None
                            ),
                        }
                    )
        return self.RESPONSE__INVALID_REQUEST

    def delete(self, request):
        """Soft-delete a published notice."""
        school_id = request.query_params.get("school")
        id = request.query_params.get("id")
        if school_id and id:
            notice = Notice.objects.filter(
                id=id, school=school_id, is_active=True
            ).first()
            if notice:
                notice.is_active = False
                notice.save(update_fields=["is_active", "updated_at"])
                return Response({"message": "Notice deleted!"})
        return self.RESPONSE__INVALID_REQUEST
