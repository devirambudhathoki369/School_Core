"""Parents: the email code, the family code, and which children they see."""
import re
from datetime import timedelta

from django.core import mail
from django.test import TestCase
from django.utils import timezone

from main.models.Guardian import Guardian, StudentGuardian
from mobileapi.guardians import issue_family_code
from mobileapi.models import AppSession, EmailCode, FamilyCode

from .helpers import DEVICE, MobileFixtures, MobileTestMixin


def sent_code():
    return re.search(r"\b(\d{6})\b", mail.outbox[-1].body).group(1)


class ParentEmailCodeTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def ask(self, email="parent@example.com", code="ONE001"):
        return self.post("auth/parent/code", {"school_code": code, "email": email})

    def verify(self, code, email="parent@example.com"):
        return self.post("auth/parent/verify", {"school_code": "ONE001", "email": email, "code": code, "device": DEVICE})

    def test_known_and_unknown_emails_get_the_same_answer_and_only_one_gets_mail(self):
        known = self.ask()
        unknown = self.ask("stranger@example.com")
        self.assertEqual((known.status_code, unknown.status_code), (202, 202))
        self.assertEqual(set(known.json()), set(unknown.json()))
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["parent@example.com"])
        self.assertIn("School one", mail.outbox[0].subject)

    def test_email_is_matched_in_any_case(self):
        self.ask("  Parent@Example.COM ")
        self.assertEqual(len(mail.outbox), 1)

    def test_one_code_a_minute_known_or_not(self):
        self.ask()
        self.assertEqual(self.error(self.ask()), "too_soon")
        self.ask("stranger@example.com")
        self.assertEqual(self.ask("stranger@example.com").status_code, 429)

    def test_the_right_code_signs_in_and_shows_only_linked_children(self):
        review = MobileFixtures.student(self.school, "Cora", last_name="Thapa", phone="9811111111")
        StudentGuardian.objects.create(
            student=review, guardian=self.guardian, relation=3, state=StudentGuardian.NEEDS_REVIEW, source=1,
        )
        self.ask()
        answer = self.verify(sent_code())
        self.assertEqual(answer.status_code, 200, answer.content)
        me = answer.json()["me"]
        self.assertEqual(me["role"], "parent")
        self.assertEqual(sorted(c["name"] for c in me["children"]), ["Asha Pun", "Bina Pun"])
        self.assertEqual(me["profile"]["phone_last_digits"], "111")
        self.assertEqual(self.get("me", answer.json()["tokens"]["access_token"]).json()["role"], "parent")

    def test_a_code_works_once(self):
        self.ask()
        code = sent_code()
        self.assertEqual(self.verify(code).status_code, 200)
        self.assertEqual(self.error(self.verify(code)), "code_expired")

    def test_five_wrong_tries_and_the_code_is_dead(self):
        self.ask()
        code = sent_code()
        wrong = "000000" if code != "000000" else "111111"
        for left in (4, 3, 2, 1):
            answer = self.verify(wrong)
            self.assertEqual(self.error(answer), "wrong_code")
            self.assertIn(str(left), answer.json()["error"]["message"])
        self.verify(wrong)
        self.assertEqual(self.error(self.verify(code)), "too_many_attempts")

    def test_an_old_code_has_expired(self):
        self.ask()
        code = sent_code()
        EmailCode.objects.update(created_at=timezone.now() - timedelta(minutes=20), expires_at=timezone.now() - timedelta(minutes=10))
        self.assertEqual(self.error(self.verify(code)), "code_expired")

    def test_a_parent_with_no_linked_child_gets_no_code(self):
        StudentGuardian.objects.filter(guardian=self.guardian).update(state=StudentGuardian.NEEDS_REVIEW, is_primary=False)
        self.ask()
        self.assertEqual(len(mail.outbox), 0)

    def test_the_parent_is_signed_out_when_the_last_link_goes(self):
        self.ask()
        token = self.verify(sent_code()).json()["tokens"]["access_token"]
        StudentGuardian.objects.filter(guardian=self.guardian).delete()
        self.assertEqual(self.get("me", token).status_code, 401)
        self.assertEqual(AppSession.objects.get().revoke_reason, AppSession.ACCESS_REMOVED)


class FamilyCodeTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.newcomer = Guardian.objects.create(school=cls.school, phone="9844444444", name="Ram Rai")
        cls.child = MobileFixtures.student(cls.school, "Dev", last_name="Rai", phone="9844444444")
        StudentGuardian.objects.create(
            student=cls.child, guardian=cls.newcomer, relation=1, state=1, source=1,
            decided_at=timezone.now(), is_primary=True,
        )

    def redeem(self, family_code, email="ram@example.com"):
        return self.post("auth/parent/family-code", {"school_code": "ONE001", "email": email, "family_code": family_code})

    def test_a_family_code_adds_the_email_and_signs_in(self):
        code = issue_family_code(self.newcomer, admin=self.admin_account)
        answer = self.redeem(code.lower().replace("-", " "))
        self.assertEqual(answer.status_code, 202, answer.content)
        self.assertEqual(mail.outbox[-1].to, ["ram@example.com"])
        signed = self.post("auth/parent/verify", {
            "school_code": "ONE001", "email": "ram@example.com", "code": sent_code(), "device": DEVICE,
        })
        self.assertEqual(signed.status_code, 200, signed.content)
        self.assertEqual([c["name"] for c in signed.json()["me"]["children"]], ["Dev Rai"])
        self.newcomer.refresh_from_db()
        self.assertEqual(self.newcomer.email, "ram@example.com")
        self.assertIsNotNone(FamilyCode.objects.get(guardian=self.newcomer).used_at)
        self.assertEqual(self.error(self.redeem(code)), "wrong_family_code")

    def test_a_wrong_or_replaced_family_code_is_refused(self):
        first = issue_family_code(self.newcomer, admin=self.admin_account)
        issue_family_code(self.newcomer, staff=self.staff_account)
        self.assertEqual(self.error(self.redeem(first)), "wrong_family_code")
        self.assertEqual(self.error(self.redeem("ABCD-EFGH")), "wrong_family_code")
        self.assertEqual(len(mail.outbox), 0)

    def test_an_email_another_parent_uses_is_refused(self):
        code = issue_family_code(self.newcomer, admin=self.admin_account)
        answer = self.redeem(code, email="parent@example.com")
        self.assertEqual(answer.status_code, 409)
        self.assertEqual(self.error(answer), "email_taken")

    def test_a_family_code_of_another_school_does_not_work_here(self):
        stranger = Guardian.objects.create(school=self.other, phone="9855555555")
        code = issue_family_code(stranger, admin=self.other.account)
        self.assertEqual(self.error(self.redeem(code)), "wrong_family_code")
