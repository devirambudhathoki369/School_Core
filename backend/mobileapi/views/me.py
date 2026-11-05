"""The signed-in person, their phones, signing out, and closing the account."""
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.response import Response

from account.auth.UserRole import UserRoles
from account.views import close_account
from main.models.Guardian import Guardian

from ..errors import MobileError
from ..models import AppSession, FamilyCode
from ..profiles import me_payload
from ..schema import ClosedOut, CloseAccountIn, MeOut, PhoneListOut
from ..tokens import ACCOUNT_FIELD, revoke
from .base import MobileAPIView

PLATFORM_NAMES = {AppSession.ANDROID: "android", AppSession.IOS: "ios"}


def _own_sessions(request):
    session = request.auth
    return AppSession.objects.filter(**{ACCOUNT_FIELD[session.role]: session.account})


class MeView(MobileAPIView):
    @extend_schema(responses=MeOut)
    def get(self, request):
        return Response(me_payload(request.auth, request))


class SignOutView(MobileAPIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        revoke(AppSession.objects.filter(pk=request.auth.pk), AppSession.SIGNED_OUT)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SignOutEverywhereView(MobileAPIView):
    @extend_schema(request=None, responses={204: None})
    def post(self, request):
        revoke(_own_sessions(request), AppSession.SIGNED_OUT_EVERYWHERE)
        return Response(status=status.HTTP_204_NO_CONTENT)


class SessionsView(MobileAPIView):
    @extend_schema(responses=PhoneListOut)
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
    @extend_schema(parameters=[OpenApiParameter("session_id", str, OpenApiParameter.PATH)], responses={204: None})
    def delete(self, request, session_id):
        if not revoke(_own_sessions(request).filter(pk=session_id), AppSession.SIGNED_OUT):
            raise MobileError("not_found", "That phone is not signed in.", status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


PORTAL_ROLE = {AppSession.STUDENT: UserRoles.ROLE_STUDENT, AppSession.STAFF: UserRoles.ROLE_STAFF}


class CloseAccountView(MobileAPIView):
    """Close the account, as the portal does (mobile/SPEC.md §5).

    Students and staff: the portal's own closing (`account.views.close_account`)
    disables the login and scrubs its personal data; the school's records stay.
    Parents: the email comes off their record and any family code is
    cancelled, so they can no longer sign in; the links to their children stay
    with the school, which can give them a new family code to come back.
    Every phone signed in to the account is signed out.
    """

    @extend_schema(request=CloseAccountIn, responses=ClosedOut)
    def post(self, request):
        session = request.auth
        if session.role == AppSession.ADMIN:
            raise MobileError(
                "forbidden", "The school's own account is closed by SchoolCore, not from the app.",
                status.HTTP_403_FORBIDDEN,
            )
        given = CloseAccountIn(data=request.data)
        if not given.is_valid() or given.validated_data["confirm"] is not True:
            raise MobileError("invalid", "Confirm that you want to close the account.",
                              fields={"confirm": "Must be true."})
        with transaction.atomic():
            if session.role == AppSession.PARENT:
                Guardian.objects.filter(pk=session.account.pk).update(email=None)
                FamilyCode.objects.filter(guardian=session.account, used_at__isnull=True,
                                          revoked_at__isnull=True).update(revoked_at=timezone.now())
            else:
                close_account(session.account, PORTAL_ROLE[session.role])
            revoke(_own_sessions(request), AppSession.ACCOUNT_CLOSED)
        return Response(ClosedOut({
            "message": "Your account is closed and you are signed out. The school keeps its records of you, "
                       "as the law asks.",
        }).data)
