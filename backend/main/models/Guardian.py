"""Parents and guardians, and which students are theirs (mobile/SPEC.md §4).

A guardian belongs to ONE school and is known there by a mobile number; the
email they sign in to the app with is optional until they first sign in. The
link to a student carries its own state, so a phone number that several
families share can wait for the school to confirm it instead of being linked.

Every rule here is also a database constraint, and a trigger (migration
0117) refuses a link whose guardian and student are in different schools.
"""
from django.db.models import (
    CASCADE,
    BooleanField,
    CharField,
    CheckConstraint,
    DateTimeField,
    ForeignKey,
    Model,
    Q,
    SmallIntegerField,
    UniqueConstraint,
)
from django.db.models.functions import Lower

MOBILE_PHONE_REGEX = r"^9[0-9]{9}$"
EMAIL_REGEX = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


class Guardian(Model):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="guardians")
    phone = CharField(max_length=10)
    email = CharField(max_length=254, null=True, blank=True)
    name = CharField(max_length=100, blank=True, default="")
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["school", "phone"], name="main_guardian_school_phone_uniq"),
            UniqueConstraint(
                fields=["school", "email"], condition=Q(email__isnull=False),
                name="main_guardian_school_email_uniq",
            ),
            CheckConstraint(condition=Q(phone__regex=MOBILE_PHONE_REGEX), name="main_guardian_phone_mobile"),
            CheckConstraint(
                condition=Q(email__isnull=True) | (Q(email=Lower("email")) & Q(email__regex=EMAIL_REGEX)),
                name="main_guardian_email_lower_valid",
            ),
        ]

    def __str__(self):
        return f"{self.name or self.phone} ({self.school_id})"


class StudentGuardian(Model):
    FATHER, MOTHER, GUARDIAN, OTHER = 1, 2, 3, 4
    RELATION_CHOICES = [(FATHER, "father"), (MOTHER, "mother"), (GUARDIAN, "guardian"), (OTHER, "other")]

    LINKED, NEEDS_REVIEW, REJECTED = 1, 2, 3
    STATE_CHOICES = [(LINKED, "linked"), (NEEDS_REVIEW, "needs review"), (REJECTED, "rejected")]

    FROM_RECORD, BY_SCHOOL = 1, 2
    SOURCE_CHOICES = [(FROM_RECORD, "from the student record"), (BY_SCHOOL, "added by the school")]

    student = ForeignKey("main.Student", on_delete=CASCADE, related_name="guardian_links")
    guardian = ForeignKey(Guardian, on_delete=CASCADE, related_name="student_links")
    relation = SmallIntegerField(choices=RELATION_CHOICES)
    state = SmallIntegerField(choices=STATE_CHOICES)
    source = SmallIntegerField(choices=SOURCE_CHOICES)
    is_primary = BooleanField(default=False)
    decided_at = DateTimeField(null=True, blank=True)
    created_at = DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            UniqueConstraint(fields=["student", "guardian"], name="main_studentguardian_pair_uniq"),
            UniqueConstraint(
                fields=["student"], condition=Q(is_primary=True), name="main_studentguardian_one_primary",
            ),
            CheckConstraint(condition=Q(relation__in=[1, 2, 3, 4]), name="main_studentguardian_relation_valid"),
            CheckConstraint(condition=Q(state__in=[1, 2, 3]), name="main_studentguardian_state_valid"),
            CheckConstraint(condition=Q(source__in=[1, 2]), name="main_studentguardian_source_valid"),
            CheckConstraint(condition=Q(is_primary=False) | Q(state=1), name="main_studentguardian_primary_linked"),
            CheckConstraint(
                condition=Q(state=2) | Q(decided_at__isnull=False), name="main_studentguardian_decided",
            ),
        ]
