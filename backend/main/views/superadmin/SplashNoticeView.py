"""Superadmin login-splash.

  GET    /api/splash/active     active splash for the logged-in user (any role)
  GET    /api/splash            list all splashes (superadmin manage)
  POST   /api/splash            create (multipart: title, message, image)
  PUT    /api/splash            update {id, title?, message?, is_active?}
  DELETE /api/splash?id=        delete
"""

from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, JSONParser

from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    SuperAdminTokenAuthentication,
    UserTokenAuthentication,
)
from ..BaseViews import SecuredAPIView
from ...models.superadmin.SplashNotice import SplashNotice


def _truthy(v):
    return str(v).lower() in ("1", "true", "yes", "on")


def _serialize(notice, request):
    image_url = None
    if notice.image:
        try:
            image_url = request.build_absolute_uri(notice.image.url)
        except Exception:
            image_url = None
    return {
        "id": notice.id,
        "title": notice.title or "",
        "message": notice.message or "",
        "image": image_url,
        "is_active": notice.is_active,
        "created_at": notice.created_at,
    }


class ActiveSplashView(SecuredAPIView):
    """The active splash, readable by any logged-in user (shown at login)."""

    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        SuperAdminTokenAuthentication,
        UserTokenAuthentication,
    )

    def get(self, request):
        notice = SplashNotice.objects.filter(is_active=True).order_by("-id").first()
        if not notice:
            return Response({"splash": None})
        return Response({"splash": _serialize(notice, request)})


class SplashNoticeView(SecuredAPIView):
    """Superadmin management of splash notices."""

    authentication_classes = (SuperAdminTokenAuthentication,)
    parser_classes = (MultiPartParser, JSONParser)

    def get(self, request):
        rows = [
            _serialize(n, request)
            for n in SplashNotice.objects.all().order_by("-id")
        ]
        return Response(rows)

    def post(self, request):
        title = request.data.get("title") or ""
        message = request.data.get("message") or ""
        image = request.FILES.get("image")
        if not title and not message and not image:
            return self.RESPONSE__INVALID_REQUEST
        notice = SplashNotice(
            title=title,
            message=message,
            is_active=_truthy(request.data.get("is_active", True)),
        )
        if image:
            notice.image.save(image.name, image, save=False)
        notice.save()
        return Response({"message": "Splash saved!", "splash": _serialize(notice, request)})

    def put(self, request):
        nid = request.data.get("id")
        if not nid:
            return self.RESPONSE__INVALID_REQUEST
        notice = SplashNotice.objects.filter(id=nid).first()
        if not notice:
            return self.RESPONSE__NOT_FOUND
        if "title" in request.data:
            notice.title = request.data.get("title") or ""
        if "message" in request.data:
            notice.message = request.data.get("message") or ""
        if "is_active" in request.data:
            notice.is_active = _truthy(request.data.get("is_active"))
        image = request.FILES.get("image")
        if image:
            notice.image.save(image.name, image, save=False)
        notice.save()
        return Response({"message": "Splash updated!", "splash": _serialize(notice, request)})

    def delete(self, request):
        nid = request.query_params.get("id")
        if not nid:
            return self.RESPONSE__INVALID_REQUEST
        SplashNotice.objects.filter(id=nid).delete()
        return Response({"message": "Splash deleted!"})
