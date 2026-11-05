"""Sign-in: the school code, passwords for students/staff/admins, and email
codes for parents (mobile/SPEC.md §2)."""
import hmac
import secrets
from datetime import timedelta

from django.contrib.auth.hashers import make_password
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from account.models import AdminAccount, StaffAccount, StudentAccount
from account.views import _login_clear_failures, _login_is_locked, _login_record_failure
from main.models.Guardian import Guardian

from ..auth import linked_students, still_at_school
from ..errors import MobileError
from ..guardians import normalize_family_code
from ..mail import CODE_MINUTES, send_code
from ..models import AppSession, EmailCode, FamilyCode
from ..profiles import me_payload, school_payload
from ..serializers import (
    PLATFORMS,
    FamilyCodeSerializer,
    ParentCodeSerializer,
    ParentVerifySerializer,
    PasswordSignInSerializer,
    RefreshSerializer,
)
from ..throttles import (
    CodeVerifyThrottle,
    EmailCodeThrottle,
    FamilyCodeThrottle,
    PasswordSignInThrottle,
    RefreshThrottle,
    SchoolLookupThrottle,
    reserve_email_send,
)
from ..tokens import RefreshRefused, code_hash, refresh, start_session
from .base import PublicMobileView, school_for_code

WRONG_LOGIN = "The username or password is not right."
ROLES = {
    "student": (AppSession.STUDENT, StudentAccount),
    "staff": (AppSession.STAFF, StaffAccount),
    "admin": (AppSession.ADMIN, AdminAccount),
}


def _signed_in(request, role, account, school, device, status_code=status.HTTP_200_OK):
    session, tokens = start_session(
        role=role,
        account=account,
        school=school,
        platform=PLATFORMS[device["platform"]],
        device_label=device.get("label", ""),
        app_version=device["app_version"],
    )
    return Response({"tokens": tokens, "me": me_payload(session, request)}, status=status_code)


class SchoolLookupView(PublicMobileView):
    throttle_classes = (SchoolLookupThrottle,)

    def get(self, request, code):
        school = school_for_code(str(code).strip().upper()[:8])
        return Response({
            "school": school_payload(school, request),
            "sign_in": {"parent": "email_code", "student": "password", "staff": "password", "admin": "password"},
        })


class PasswordSignInView(PublicMobileView):
    throttle_classes = (PasswordSignInThrottle,)

    def post(self, request):
        data = PasswordSignInSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        data = data.validated_data
        school = school_for_code(data["school_code"])
        username = data["username"].strip()
        if _login_is_locked(username, request):
            raise MobileError(
                "locked", "Too many failed sign-in attempts. Please wait 15 minutes and try again.",
                status.HTTP_429_TOO_MANY_REQUESTS,
            )
        role, Model = ROLES[data["role"]]
        account = Model.objects.filter(username=username).first()
        if account is None:
            make_password(data["password"])  # as slow as a wrong password
            ok = False
        else:
            ok = account.check_password(data["password"]) and still_at_school(role, account, school.id)
        if not ok:
            _login_record_failure(username, request)
            raise MobileError("invalid_credentials", WRONG_LOGIN, status.HTTP_401_UNAUTHORIZED)
        _login_clear_failures(username, request)
        return _signed_in(request, role, account, school, data["device"])


def _code_sent(email):
    return Response(
        {"sent_to": email, "resend_after": 60, "expires_in": CODE_MINUTES * 60}, status=status.HTTP_202_ACCEPTED
    )


def _new_code(guardian, email, purpose) -> str:
    code = f"{secrets.randbelow(10 ** 6):06d}"
    now = timezone.now()
    EmailCode.objects.create(
        guardian=guardian, email=email, purpose=purpose, code_hash=code_hash(code),
        created_at=now, expires_at=now + timedelta(minutes=CODE_MINUTES),
    )
    return code


class ParentCodeView(PublicMobileView):
    """Email a sign-in code. The answer is the same whether or not the
    school has the address, so it cannot be used to look parents up."""

    throttle_classes = (EmailCodeThrottle,)

    def post(self, request):
        data = ParentCodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        school = school_for_code(data.validated_data["school_code"])
        email = data.validated_data["email"]
        reserve_email_send(email)
        guardian = Guardian.objects.filter(school=school, email=email, is_active=True).first()
        if guardian is not None and linked_students(guardian).exists():
            send_code(email, _new_code(guardian, email, EmailCode.SIGN_IN), school.name, adding_email=False)
        return _code_sent(email)


class FamilyCodeView(PublicMobileView):
    """A parent whose email the school does not have: the family code from
    the school, then a code to the email to prove it is theirs."""

    throttle_classes = (FamilyCodeThrottle,)

    def post(self, request):
        data = FamilyCodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        data = data.validated_data
        school = school_for_code(data["school_code"])
        entry = (
            FamilyCode.objects.select_related("guardian")
            .filter(
                code_hash=code_hash(normalize_family_code(data["family_code"])),
                guardian__school=school,
                guardian__is_active=True,
                used_at__isnull=True,
                revoked_at__isnull=True,
                expires_at__gt=timezone.now(),
            )
            .first()
        )
        if entry is None:
            raise MobileError(
                "wrong_family_code", "That family code is not right or has expired. Ask the school for a new one.",
            )
        email = data["email"]
        if Guardian.objects.filter(school=school, email=email).exclude(pk=entry.guardian_id).exists():
            raise MobileError(
                "email_taken", "Another parent at this school already uses this email.", status.HTTP_409_CONFLICT,
            )
        reserve_email_send(email)
        send_code(email, _new_code(entry.guardian, email, EmailCode.ADD_EMAIL), school.name, adding_email=True)
        return _code_sent(email)


class ParentVerifyView(PublicMobileView):
    throttle_classes = (CodeVerifyThrottle,)

    def post(self, request):
        data = ParentVerifySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        data = data.validated_data
        school = school_for_code(data["school_code"])
        email = data["email"]
        now = timezone.now()
        entry = (
            EmailCode.objects.select_related("guardian")
            .filter(email=email, guardian__school=school, consumed_at__isnull=True, expires_at__gt=now)
            .order_by("-created_at")
            .first()
        )
        if entry is None:
            raise MobileError("code_expired", "That code has expired. Ask for a new one.")
        if entry.attempts >= EmailCode.MAX_ATTEMPTS:
            raise MobileError(
                "too_many_attempts", "Too many wrong tries. Ask for a new code.", status.HTTP_429_TOO_MANY_REQUESTS
            )
        if not hmac.compare_digest(code_hash(data["code"]), entry.code_hash):
            EmailCode.objects.filter(pk=entry.pk, attempts__lt=EmailCode.MAX_ATTEMPTS).update(
                attempts=F("attempts") + 1
            )
            left = EmailCode.MAX_ATTEMPTS - entry.attempts - 1
            raise MobileError(
                "wrong_code", f"That code is not right. {left} {'try' if left == 1 else 'tries'} left." if left
                else "That code is not right. Ask for a new one.",
            )
        if not EmailCode.objects.filter(pk=entry.pk, consumed_at__isnull=True).update(consumed_at=now):
            raise MobileError("code_expired", "That code has already been used. Ask for a new one.")

        guardian = entry.guardian
        if entry.purpose == EmailCode.ADD_EMAIL:
            try:
                with transaction.atomic():
                    Guardian.objects.filter(pk=guardian.pk).update(email=email, updated_at=now)
                    FamilyCode.objects.filter(guardian=guardian, used_at__isnull=True, revoked_at__isnull=True).update(
                        used_at=now
                    )
            except IntegrityError:
                raise MobileError(
                    "email_taken", "Another parent at this school already uses this email.", status.HTTP_409_CONFLICT,
                )
            guardian.email = email
        if not guardian.is_active or not linked_students(guardian).exists():
            raise MobileError(
                "no_children", "No student is linked to you yet. Please contact the school.",
                status.HTTP_403_FORBIDDEN,
            )
        return _signed_in(request, AppSession.PARENT, guardian, school, data["device"])


class RefreshView(PublicMobileView):
    throttle_classes = (RefreshThrottle,)

    def post(self, request):
        data = RefreshSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            _, tokens = refresh(data.validated_data["refresh_token"])
        except RefreshRefused:
            raise MobileError("refresh_refused", "Please sign in again.", status.HTTP_401_UNAUTHORIZED)
        return Response({"tokens": tokens})
