"""Sign-in state of the mobile app (mobile/SPEC.md §3–4).

Nothing secret is stored readable: refresh tokens, email codes and family
codes are kept as hashes. Each rule below is also a database constraint.
"""
import uuid

from django.db.models import (
    CASCADE,
    CharField,
    CheckConstraint,
    DateTimeField,
    F,
    ForeignKey,
    Index,
    Model,
    Q,
    SmallIntegerField,
    UniqueConstraint,
    UUIDField,
)
from django.db.models.functions import Lower
from django.utils import timezone

from main.models.Guardian import EMAIL_REGEX

HASH_REGEX = r"^[0-9a-f]{64}$"


class AppSession(Model):
    """One signed-in phone. Exactly one account column is set, matching `role`."""

    PARENT, STUDENT, STAFF, ADMIN = 1, 2, 3, 4
    ROLE_CHOICES = [(PARENT, "parent"), (STUDENT, "student"), (STAFF, "staff"), (ADMIN, "admin")]
    ROLE_NAMES = {PARENT: "parent", STUDENT: "student", STAFF: "staff", ADMIN: "admin"}

    ANDROID, IOS = 1, 2
    PLATFORM_CHOICES = [(ANDROID, "Android"), (IOS, "iOS")]

    SIGNED_OUT, SIGNED_OUT_EVERYWHERE, PASSWORD_CHANGED, TOKEN_REUSED, REPLACED, ACCOUNT_CLOSED, ACCESS_REMOVED = (
        1, 2, 3, 4, 5, 6, 7,
    )
    REVOKE_CHOICES = [
        (SIGNED_OUT, "signed out"),
        (SIGNED_OUT_EVERYWHERE, "signed out everywhere"),
        (PASSWORD_CHANGED, "password changed"),
        (TOKEN_REUSED, "a used refresh token came back"),
        (REPLACED, "replaced by a newer sign-in"),
        (ACCOUNT_CLOSED, "account closed"),
        (ACCESS_REMOVED, "no longer at the school"),
    ]

    id = UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    role = SmallIntegerField(choices=ROLE_CHOICES)
    guardian = ForeignKey("main.Guardian", on_delete=CASCADE, null=True, blank=True, related_name="app_sessions")
    student_account = ForeignKey(
        "account.StudentAccount", on_delete=CASCADE, null=True, blank=True, related_name="app_sessions"
    )
    staff_account = ForeignKey(
        "account.StaffAccount", on_delete=CASCADE, null=True, blank=True, related_name="app_sessions"
    )
    admin_account = ForeignKey(
        "account.AdminAccount", on_delete=CASCADE, null=True, blank=True, related_name="app_sessions"
    )
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="app_sessions")
    platform = SmallIntegerField(choices=PLATFORM_CHOICES)
    device_label = CharField(max_length=80, blank=True, default="")
    app_version = CharField(max_length=20)
    # A hash of the account's password hash when the session began: a password
    # changed anywhere (app, portal, admin) no longer matches, and ends it.
    credential_stamp = CharField(max_length=64, blank=True, default="")
    created_at = DateTimeField(default=timezone.now)
    last_seen_at = DateTimeField(default=timezone.now)
    revoked_at = DateTimeField(null=True, blank=True)
    revoke_reason = SmallIntegerField(choices=REVOKE_CHOICES, null=True, blank=True)

    class Meta:
        db_table = "mobileapi_session"
        constraints = [
            CheckConstraint(
                condition=(
                    Q(role=1, guardian__isnull=False, student_account__isnull=True,
                      staff_account__isnull=True, admin_account__isnull=True)
                    | Q(role=2, guardian__isnull=True, student_account__isnull=False,
                        staff_account__isnull=True, admin_account__isnull=True)
                    | Q(role=3, guardian__isnull=True, student_account__isnull=True,
                        staff_account__isnull=False, admin_account__isnull=True)
                    | Q(role=4, guardian__isnull=True, student_account__isnull=True,
                        staff_account__isnull=True, admin_account__isnull=False)
                ),
                name="mobileapi_session_one_account_for_role",
            ),
            CheckConstraint(condition=Q(platform__in=[1, 2]), name="mobileapi_session_platform_valid"),
            # `revoke_reason IN (...)` alone is NULL for a NULL reason, and a CHECK
            # passes on NULL, so the non-null test is spelled out.
            CheckConstraint(
                condition=Q(revoked_at__isnull=True, revoke_reason__isnull=True)
                | Q(revoked_at__isnull=False, revoke_reason__isnull=False, revoke_reason__in=[1, 2, 3, 4, 5, 6, 7]),
                name="mobileapi_session_revoked_with_reason",
            ),
        ]

    @property
    def role_name(self):
        return self.ROLE_NAMES[self.role]

    @property
    def account(self):
        return self.guardian or self.student_account or self.staff_account or self.admin_account


class RefreshToken(Model):
    session = ForeignKey(AppSession, on_delete=CASCADE, related_name="refresh_tokens")
    token_hash = CharField(max_length=64, unique=True)
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField()
    used_at = DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mobileapi_refreshtoken"
        constraints = [
            CheckConstraint(condition=Q(token_hash__regex=HASH_REGEX), name="mobileapi_refreshtoken_hash_format"),
            CheckConstraint(condition=Q(expires_at__gt=F("created_at")), name="mobileapi_refreshtoken_expiry"),
            UniqueConstraint(
                fields=["session"], condition=Q(used_at__isnull=True), name="mobileapi_refreshtoken_one_live",
            ),
        ]


class EmailCode(Model):
    """A 6-digit code emailed to a parent: to sign in, or to add their email."""

    SIGN_IN, ADD_EMAIL = 1, 2
    PURPOSE_CHOICES = [(SIGN_IN, "sign in"), (ADD_EMAIL, "add this email after a family code")]
    MAX_ATTEMPTS = 5

    guardian = ForeignKey("main.Guardian", on_delete=CASCADE, related_name="email_codes")
    email = CharField(max_length=254)
    purpose = SmallIntegerField(choices=PURPOSE_CHOICES)
    code_hash = CharField(max_length=64)
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField()
    attempts = SmallIntegerField(default=0)
    consumed_at = DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mobileapi_emailcode"
        indexes = [Index(fields=["email", "-created_at"], name="mobileapi_emailcode_recent")]
        constraints = [
            CheckConstraint(
                condition=Q(email=Lower("email")) & Q(email__regex=EMAIL_REGEX), name="mobileapi_emailcode_email",
            ),
            CheckConstraint(condition=Q(purpose__in=[1, 2]), name="mobileapi_emailcode_purpose_valid"),
            CheckConstraint(condition=Q(code_hash__regex=HASH_REGEX), name="mobileapi_emailcode_hash_format"),
            CheckConstraint(condition=Q(expires_at__gt=F("created_at")), name="mobileapi_emailcode_expiry"),
            CheckConstraint(condition=Q(attempts__gte=0, attempts__lte=5), name="mobileapi_emailcode_attempts"),
        ]


class FamilyCode(Model):
    """A one-time code the school hands a parent whose email it does not have."""

    guardian = ForeignKey("main.Guardian", on_delete=CASCADE, related_name="family_codes")
    code_hash = CharField(max_length=64, unique=True)
    issued_by_admin = ForeignKey(
        "account.AdminAccount", on_delete=CASCADE, null=True, blank=True, related_name="+"
    )
    issued_by_staff = ForeignKey(
        "account.StaffAccount", on_delete=CASCADE, null=True, blank=True, related_name="+"
    )
    created_at = DateTimeField(default=timezone.now)
    expires_at = DateTimeField()
    used_at = DateTimeField(null=True, blank=True)
    revoked_at = DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "mobileapi_familycode"
        constraints = [
            CheckConstraint(condition=Q(code_hash__regex=HASH_REGEX), name="mobileapi_familycode_hash_format"),
            CheckConstraint(condition=Q(expires_at__gt=F("created_at")), name="mobileapi_familycode_expiry"),
            CheckConstraint(
                condition=Q(issued_by_admin__isnull=False, issued_by_staff__isnull=True)
                | Q(issued_by_admin__isnull=True, issued_by_staff__isnull=False),
                name="mobileapi_familycode_one_issuer",
            ),
            UniqueConstraint(
                fields=["guardian"], condition=Q(used_at__isnull=True, revoked_at__isnull=True),
                name="mobileapi_familycode_one_live",
            ),
        ]
