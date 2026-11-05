"""PostgreSQL itself refuses rows that break the rules in mobile/SPEC.md §4."""
from datetime import timedelta

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from main.models.Guardian import Guardian, StudentGuardian
from mobileapi.models import AppSession, EmailCode, FamilyCode, RefreshToken

from .helpers import MobileFixtures

HASH = "a" * 64


class DatabaseRuleTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def refused(self, make):
        with self.assertRaises(IntegrityError), transaction.atomic():
            make()

    def test_a_guardian_needs_a_nepali_mobile_number(self):
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="014000000"))
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="1811111111"))

    def test_a_guardian_email_is_lower_case_and_one_per_school(self):
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="9822222222", email="Parent@X.com"))
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="9822222222", email="not-an-email"))
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="9822222222", email="parent@example.com"))
        Guardian.objects.create(school=self.other, phone="9822222222", email="parent@example.com")

    def test_one_guardian_per_school_and_number(self):
        self.refused(lambda: Guardian.objects.create(school=self.school, phone="9811111111"))

    def test_a_guardian_is_never_linked_to_another_schools_student(self):
        stranger = MobileFixtures.student(self.other, "Chandra")
        self.refused(lambda: StudentGuardian.objects.create(
            student=stranger, guardian=self.guardian, relation=1, state=1, source=2, decided_at=timezone.now(),
        ))

    def test_one_primary_guardian_per_student_and_only_when_linked(self):
        second = Guardian.objects.create(school=self.school, phone="9833333333")
        self.refused(lambda: StudentGuardian.objects.create(
            student=self.student, guardian=second, relation=2, state=1, source=2, decided_at=timezone.now(),
            is_primary=True,
        ))
        self.refused(lambda: StudentGuardian.objects.create(
            student=self.student, guardian=second, relation=2, state=2, source=1, is_primary=True,
        ))

    def test_a_link_out_of_review_says_when(self):
        second = Guardian.objects.create(school=self.school, phone="9833333333")
        self.refused(lambda: StudentGuardian.objects.create(
            student=self.student, guardian=second, relation=2, state=1, source=1,
        ))

    def session(self, **fields):
        base = {"role": AppSession.STUDENT, "student_account": self.student_account, "school": self.school,
                "platform": AppSession.ANDROID, "app_version": "1.0.0"}
        return AppSession.objects.create(**{**base, **fields})

    def test_a_session_has_exactly_the_account_its_role_names(self):
        self.refused(lambda: self.session(role=AppSession.STAFF))
        self.refused(lambda: self.session(staff_account=self.staff_account))
        self.refused(lambda: self.session(role=AppSession.PARENT, student_account=None))
        self.refused(lambda: self.session(platform=3))

    def test_an_ended_session_says_why(self):
        self.refused(lambda: self.session(revoked_at=timezone.now()))
        self.refused(lambda: self.session(revoke_reason=AppSession.SIGNED_OUT))

    def test_one_live_refresh_token_per_session(self):
        session = self.session()
        later = timezone.now() + timedelta(days=1)
        RefreshToken.objects.create(session=session, token_hash=HASH, expires_at=later)
        self.refused(lambda: RefreshToken.objects.create(session=session, token_hash="b" * 64, expires_at=later))
        self.refused(lambda: RefreshToken.objects.create(session=session, token_hash="not-a-hash", expires_at=later))

    def test_email_codes_allow_five_tries_and_expire_later(self):
        later = timezone.now() + timedelta(minutes=10)
        base = {"guardian": self.guardian, "email": "parent@example.com", "purpose": 1, "code_hash": HASH}
        self.refused(lambda: EmailCode.objects.create(**base, expires_at=later, attempts=6))
        self.refused(lambda: EmailCode.objects.create(**base, expires_at=timezone.now() - timedelta(minutes=1)))

    def test_a_family_code_has_one_issuer_and_one_live_per_parent(self):
        later = timezone.now() + timedelta(days=7)
        self.refused(lambda: FamilyCode.objects.create(guardian=self.guardian, code_hash=HASH, expires_at=later))
        self.refused(lambda: FamilyCode.objects.create(
            guardian=self.guardian, code_hash=HASH, expires_at=later,
            issued_by_admin=self.admin_account, issued_by_staff=self.staff_account,
        ))
        FamilyCode.objects.create(guardian=self.guardian, code_hash=HASH, expires_at=later, issued_by_admin=self.admin_account)
        self.refused(lambda: FamilyCode.objects.create(
            guardian=self.guardian, code_hash="b" * 64, expires_at=later, issued_by_admin=self.admin_account,
        ))

    def test_a_school_code_is_four_to_eight_capitals_or_digits(self):
        for bad in ("abc1", "AB", "AB-12", "ONE 1"):
            self.school.app_code = bad
            self.refused(lambda: self.school.save(update_fields=["app_code"]))
