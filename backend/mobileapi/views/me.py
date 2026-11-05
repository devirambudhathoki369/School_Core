"""The signed-in person, their phones, and signing out."""
from rest_framework import status
from rest_framework.response import Response

from ..errors import MobileError
from ..models import AppSession
from ..profiles import me_payload
from ..tokens import ACCOUNT_FIELD, revoke
from .base import MobileAPIView

PLATFORM_NAMES = {AppSession.ANDROID: "android", AppSession.IOS: "ios"}


def _own_sessions(request):
    session = request.auth
    return AppSession.objects.filter(**{ACCOUNT_FIELD[session.role]: session.account})


class MeView(MobileAPIView):
    def get(self, request):
        return Response(me_payload(request.auth, request))


class SignOutView(MobileAPIView):
    def post(self, request):
        revoke(AppSession.objects.filter(pk=request.auth.pk), AppSession.SIGNED_OUT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SignOutEverywhereView(MobileAPIView):
    def post(self, request):
        revoke(_own_sessions(request), AppSession.SIGNED_OUT_EVERYWHERE)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionsView(MobileAPIView):
    def get(self, request):
        current = request.auth.pk
        items = [
            {
                "id": str(s.id),
                "platform": PLATFORM_NAMES.get(s.platform),
                "device_label": s.device_label,
                "app_version": s.app_version,
                "created_at": s.created_at.isoformat(),
                "last_seen_at": s.last_seen_at.isoformat(),
                "current": s.id == current,
            }
            for s in _own_sessions(request).filter(revoked_at__isnull=True).order_by("-last_seen_at")
        ]
        return Response({"items": items})


class SessionDetailView(MobileAPIView):
    def delete(self, request, session_id):
        if not revoke(_own_sessions(request).filter(pk=session_id), AppSession.SIGNED_OUT):
            raise MobileError("not_found", "That phone is not signed in.", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
