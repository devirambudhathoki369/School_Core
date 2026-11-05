"""Bearer-token authentication for /api/mobile/v1/ (mobile/SPEC.md §3).

The portal's cookie is never read here: a mobile request carries only
``Authorization: Bearer mv1.…``. Each request loads its session and refuses
it when the session has ended, the password changed since sign-in, the
person is no longer active at the session's school, or the school has
switched the app off.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework import exceptions
from rest_framework.authentication import BaseAuthentication, get_authorization_header

from main.models.Guardian import StudentGuardian
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff
from main.models.Student import Student

from .models import AppSession
from .tokens import credential_stamp, read_access_token, revoke

LAST_SEEN_EVERY = timedelta(minutes=5)
STUDENT_RUNNING = 1
STAFF_EMPLOYED = 1


class MobilePrincipal:
    """Who a mobile request acts for: the session, its account and school."""

    is_authenticated = True
    is_anonymous = False

    def __init__(self, session: AppSession):
        self.session = session
        self.role = session.role
        self.account = session.account
        self.school = session.school
        self.pk = self.account.pk

    def __str__(self):
        return f"{self.session.role_name}:{self.pk}"


def linked_students(guardian):
    """The children a parent may see: linked (state 1), active, still enrolled."""
    return Student.objects.filter(
        guardian_links__guardian=guardian,
        guardian_links__state=StudentGuardian.LINKED,
        is_active=True,
        status=STUDENT_RUNNING,
        class_info__school_id=guardian.school_id,
    )


def school_takes_app(school: SchoolAdmin) -> bool:
    return bool(school.is_active and school.uses_mobile_app and school.app_code)


def still_at_school(role: int, account, school_id: int) -> bool:
    if role == AppSession.PARENT:
        return (
            account.is_active
            and account.school_id == school_id
            and linked_students(account).exists()
        )
    if role == AppSession.STUDENT:
        return bool(account.verified) and Student.objects.filter(
            account=account, is_active=True, status=STUDENT_RUNNING, class_info__school_id=school_id
        ).exists()
    if role == AppSession.STAFF:
        return bool(account.verified) and Staff.objects.filter(
            account=account, school_id=school_id, is_active=True, status=STAFF_EMPLOYED
        ).exists()
    if role == AppSession.ADMIN:
        return SchoolAdmin.objects.filter(account=account, id=school_id, is_active=True).exists()
    return False


class MobileTokenAuthentication(BaseAuthentication):
    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if len(parts) != 2 or parts[0].lower() != self.keyword:
            raise exceptions.AuthenticationFailed("Invalid authorization header.")
        try:
            token = parts[1].decode("ascii")
        except UnicodeError:
            raise exceptions.AuthenticationFailed("Invalid authorization header.")

        session_id = read_access_token(token)
        if session_id is None:
            raise exceptions.AuthenticationFailed("Token expired or invalid.")
        session = (
            AppSession.objects.select_related(
                "school", "guardian", "student_account", "staff_account", "admin_account"
            )
            .filter(pk=session_id, revoked_at__isnull=True)
            .first()
        )
        if session is None:
            raise exceptions.AuthenticationFailed("Session ended.")

        if not school_takes_app(session.school):
            raise exceptions.AuthenticationFailed("The school has switched the app off.")
        account = session.account
        if session.role != AppSession.PARENT and credential_stamp(account) != session.credential_stamp:
            revoke(AppSession.objects.filter(pk=session.pk), AppSession.PASSWORD_CHANGED)
            raise exceptions.AuthenticationFailed("The password was changed.")
        if not still_at_school(session.role, account, session.school_id):
            revoke(AppSession.objects.filter(pk=session.pk), AppSession.ACCESS_REMOVED)
            raise exceptions.AuthenticationFailed("No longer at this school.")

        now = timezone.now()
        if now - session.last_seen_at > LAST_SEEN_EVERY:
            AppSession.objects.filter(pk=session.pk).update(last_seen_at=now)
            session.last_seen_at = now
        return MobilePrincipal(session), session

    def authenticate_header(self, request):
        return 'Bearer realm="schoolcore-mobile"'
