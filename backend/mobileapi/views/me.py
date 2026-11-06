"""The signed-in person, their phones, signing out, and closing the account."""
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.response import Response

from account.auth.AuthToken import AdminAuthToken, StaffAuthToken, StudentAuthToken
from account.auth.UserRole import UserRoles
from account.passwords import password_problem, require_current_password
from account.views import close_account
from main.models.Guardian import Guardian

from ..errors import MobileError
from ..idempotency import idempotent
from ..models import AppSession, FamilyCode
from ..profiles import me_payload
from ..schema import ClosedOut, CloseAccountIn, MeOut, PasswordIn, PhoneListOut, PushTokenIn
from ..tokens import ACCOUNT_FIELD, credential_stamp, revoke
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


class PushTokenView(MobileAPIView):
    """This phone's Expo push token, on this session only. Signing out ends
    the session, and its notifications with it."""

    @extend_schema(request=PushTokenIn, responses={204: None})
    def put(self, request):
        given = PushTokenIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "That is not an Expo push token.", fields={"token": "Not a push token."})
        AppSession.objects.filter(pk=request.auth.pk).update(push_token=given.validated_data["token"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={204: None})
    def delete(self, request):
        AppSession.objects.filter(pk=request.auth.pk).update(push_token=None)
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


PORTAL_TOKENS = {AppSession.STUDENT: StudentAuthToken, AppSession.STAFF: StaffAuthToken, AppSession.ADMIN: AdminAuthToken}


class PasswordView(MobileAPIView):
    """Change the account's password: students, staff and the school admin.

    The portal's rules apply (15 to 128 characters, not a common or numbers-
    only password) and its throttled check of the current one. Every other
    phone and every portal sign-in of the account is signed out; this phone
    stays signed in.
    """

    @extend_schema(request=PasswordIn, responses=ClosedOut)
    @idempotent
    def post(self, request):
        session = request.auth
        if session.role not in PORTAL_TOKENS:
            raise MobileError("forbidden", "Parents sign in with an emailed code and have no password.",
                              status.HTTP_403_FORBIDDEN)
        given = PasswordIn(data=request.data)
        if not given.is_valid():
            raise MobileError("invalid", "Fill in both passwords.", fields={
                key: str(value[0]) for key, value in given.errors.items()
            })
        account = session.account
        current, new = given.validated_data["current_password"], given.validated_data["new_password"]
        try:
            require_current_password(account, current)
        except Throttled:
            raise MobileError("rate_limited", "Too many wrong passwords. Try again in 15 minutes.",
                              status.HTTP_429_TOO_MANY_REQUESTS)
        except ValidationError:
            raise MobileError("wrong_password", "The current password is not right.",
                              fields={"current_password": "Not right."})
        problem = password_problem(new, account)
        if problem:
            raise MobileError("weak_password", problem, fields={"new_password": problem})
        if account.check_password(new):
            raise MobileError("same_password", "Choose a password you have not used just now.",
                              fields={"new_password": "The same as the current one."})
        with transaction.atomic():
            account.set_password(new)
            account.save()
            PORTAL_TOKENS[session.role].objects.filter(user=account).delete()
            revoke(_own_sessions(request).exclude(pk=session.pk), AppSession.PASSWORD_CHANGED)
            # this phone stays signed in under the new password
            AppSession.objects.filter(pk=session.pk).update(credential_stamp=credential_stamp(account))
        return Response(ClosedOut({
            "message": "Your password is changed. Other phones and the portal are signed out.",
        }).data)
