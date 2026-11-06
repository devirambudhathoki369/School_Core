"""A student invites their parent (mobile/SPEC.md §2).

Almost no parent's email is on the school's records, so most parents need a
family code the first time. The student, already signed in with the
school's username, makes one in their app and shows it to their parent, who
enters it with their own email. The office can still make codes too.

A student may invite only their confirmed parent (a state 1 link), and only
while that parent has no email on record: a family code also sets the
parent's email, so letting a student make one later would let them move
their parent's sign-in to another address. Changing an email stays with the
school office.
"""
from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response

from main.models.Guardian import StudentGuardian

from ..access import require_role
from ..auth import STUDENT_RUNNING
from ..errors import MobileError
from ..guardians import FAMILY_CODE_DAYS, issue_family_code
from ..models import AppSession
from .base import MobileAPIView

INVITES_PER_DAY = 10
NO_PARENT = "The school has no confirmed parent's phone number for you yet. Ask the school office to add it."
ALREADY_IN = "Your parent already signs in with their email. To change it, ask the school office."


class InviteParentOut(serializers.Serializer):
    name = serializers.CharField()
    phone_last_digits = serializers.CharField()
    on_app = serializers.BooleanField(help_text="Signed in on a phone now")
    has_email = serializers.BooleanField(help_text="Has joined: signs in with their email")


class InviteStatusOut(serializers.Serializer):
    parent = InviteParentOut(allow_null=True)
    can_invite = serializers.BooleanField()
    reason = serializers.CharField(allow_null=True, help_text="Why an invite can't be made, when it can't")


class InviteOut(serializers.Serializer):
    code = serializers.CharField(help_text="Shown once; only its hash is kept")
    expires_at = serializers.DateTimeField()
    school_code = serializers.CharField()
    parent = InviteParentOut()


def _parent(request):
    """The student's confirmed parent at their school: the primary one first."""
    session = request.auth
    link = (
        StudentGuardian.objects.select_related("guardian")
        .filter(
            student__account=session.account, student__is_active=True, student__status=STUDENT_RUNNING,
            student__class_info__school_id=session.school_id, state=StudentGuardian.LINKED,
            guardian__school_id=session.school_id, guardian__is_active=True,
        )
        .order_by("-is_primary", "id")
        .first()
    )
    return link.guardian if link else None


def _parent_out(guardian) -> dict:
    return {
        "name": guardian.name or "Your parent",
        "phone_last_digits": guardian.phone[-3:],
        "on_app": AppSession.objects.filter(guardian=guardian, revoked_at__isnull=True).exists(),
        "has_email": bool(guardian.email),
    }


class ParentInviteView(MobileAPIView):
    @extend_schema(responses=InviteStatusOut)
    def get(self, request):
        require_role(request, AppSession.STUDENT)
        guardian = _parent(request)
        body = {
            "parent": _parent_out(guardian) if guardian else None,
            "can_invite": bool(guardian and not guardian.email),
            "reason": NO_PARENT if guardian is None else ALREADY_IN if guardian.email else None,
        }
        return Response(InviteStatusOut(body).data)

    @extend_schema(request=None, responses={201: InviteOut})
    def post(self, request):
        # Not replayed by an Idempotency-Key: that would keep the code in the
        # cache. A retry makes a new code, which cancels the one before.
        require_role(request, AppSession.STUDENT)
        guardian = _parent(request)
        if guardian is None:
            raise MobileError("no_parent", NO_PARENT, status.HTTP_409_CONFLICT)
        if guardian.email:
            raise MobileError("parent_joined", ALREADY_IN, status.HTTP_409_CONFLICT)
        day_key = f"mobile:invites:{request.auth.account.pk}"
        cache.add(day_key, 0, 24 * 60 * 60)
        try:
            made = cache.incr(day_key)
        except ValueError:
            cache.set(day_key, 1, 24 * 60 * 60)
            made = 1
        if made > INVITES_PER_DAY:
            raise MobileError("rate_limited", "That is enough invites for today. Try again tomorrow.",
                              status.HTTP_429_TOO_MANY_REQUESTS)
        code = issue_family_code(guardian, student=request.auth.account)
        body = {
            "code": code,
            "expires_at": timezone.now() + timedelta(days=FAMILY_CODE_DAYS),
            "school_code": request.auth.school.app_code,
            "parent": _parent_out(guardian),
        }
        return Response(InviteOut(body).data, status=status.HTTP_201_CREATED)
