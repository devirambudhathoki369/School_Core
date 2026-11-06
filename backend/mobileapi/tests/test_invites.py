"""A student invites their parent (mobile/SPEC.md §2)."""
import re

from django.core import mail
from django.db import IntegrityError, transaction
from django.test import TestCase

from main.models.Guardian import Guardian, StudentGuardian
from mobileapi.models import AppSession, FamilyCode

from .helpers import DEVICE, MobileFixtures, MobileTestMixin, WriteMixin, session_token


class InviteTests(MobileTestMixin, WriteMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        Guardian.objects.filter(pk=cls.guardian.pk).update(email=None)  # not joined yet
        cls.token = session_token(AppSession.STUDENT, cls.student_account, cls.school)

    def invite(self, token=None):
        return self.api(token or self.token).post("/api/mobile/v1/me/parent-invite", {}, format="json")

    def test_the_parent_joins_with_the_students_code(self):
        status = self.get("me/parent-invite", self.token).json()
        self.assertEqual((status["can_invite"], status["parent"]["phone_last_digits"]), (True, "111"))
        answer = self.invite()
        self.assertEqual(answer.status_code, 201, answer.content)
        code, school = answer.json()["code"], answer.json()["school_code"]
        self.assertEqual(school, "ONE001")
        entry = FamilyCode.objects.get(guardian=self.guardian, revoked_at__isnull=True)
        self.assertEqual(entry.issued_by_student_id, self.student_account.id)
        # the parent, on their own phone
        sent = self.post("auth/parent/family-code", {"school_code": school, "email": "mum@example.com",
                                                     "family_code": code})
        self.assertEqual(sent.status_code, 202, sent.content)
        emailed = re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)
        signed = self.post("auth/parent/verify", {"school_code": school, "email": "mum@example.com",
                                                  "code": emailed, "device": DEVICE})
        self.assertEqual(signed.status_code, 200, signed.content)
        self.assertEqual({c["id"] for c in signed.json()["me"]["children"]}, {self.student.id, self.sibling.id})
        self.assertEqual(Guardian.objects.get(pk=self.guardian.pk).email, "mum@example.com")
        # joined: the student can no longer make codes that would move the email
        self.assertEqual(self.error(self.invite()), "parent_joined")
        self.assertFalse(self.get("me/parent-invite", self.token).json()["can_invite"])

    def test_a_new_invite_cancels_the_last(self):
        self.invite()
        self.invite()
        self.assertEqual(FamilyCode.objects.filter(guardian=self.guardian, revoked_at__isnull=True).count(), 1)

    def test_only_a_confirmed_parent_can_be_invited(self):
        StudentGuardian.objects.filter(student=self.student).update(state=StudentGuardian.NEEDS_REVIEW,
                                                                     is_primary=False)
        self.assertEqual(self.error(self.invite()), "no_parent")
        self.assertIsNone(self.get("me/parent-invite", self.token).json()["parent"])

    def test_invites_are_limited_each_day(self):
        for _ in range(10):
            self.assertEqual(self.invite().status_code, 201)
        self.assertEqual(self.error(self.invite()), "rate_limited")

    def test_only_students_invite(self):
        for role, account in ((AppSession.PARENT, self.guardian), (AppSession.STAFF, self.staff_account),
                              (AppSession.ADMIN, self.admin_account)):
            self.assertEqual(self.invite(session_token(role, account, self.school)).status_code, 403)

    def test_the_database_wants_exactly_one_issuer(self):
        entry = FamilyCode.objects.get(pk=FamilyCode.objects.create(
            guardian=self.guardian, code_hash="a" * 64, issued_by_student=self.student_account,
            expires_at="2099-01-01T00:00:00Z",
        ).pk)
        with self.assertRaises(IntegrityError), transaction.atomic():
            FamilyCode.objects.filter(pk=entry.pk).update(issued_by_admin=self.admin_account)
