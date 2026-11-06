"""Changing a password from the app (mobile/SPEC.md §3)."""
from django.test import TestCase

from account.auth.AuthToken import StudentAuthToken
from account.models import StudentAccount
from mobileapi.models import AppSession

from .helpers import PASSWORD, MobileFixtures, MobileTestMixin, WriteMixin, session_token

NEW = "a brand new long passphrase"


class PasswordTests(MobileTestMixin, WriteMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def setUp(self):
        super().setUp()
        self.token = self.tokens()["access_token"]

    def change(self, current=PASSWORD, new=NEW, token=None, key=None):
        return self.write("post", "me/password", {"current_password": current, "new_password": new},
                          token or self.token, key=key)

    def test_a_student_changes_it_and_only_this_phone_stays_signed_in(self):
        other_phone = self.tokens()["access_token"]
        StudentAuthToken.objects.create(user=self.student_account)
        answer = self.change(key="password-key-1")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(self.get("me", self.token).status_code, 200)
        self.assertEqual(self.get("me", other_phone).status_code, 401)
        self.assertFalse(StudentAuthToken.objects.filter(user=self.student_account).exists())
        self.assertTrue(StudentAccount.objects.get(pk=self.student_account.pk).check_password(NEW))
        self.assertEqual(self.sign_in(password=NEW).status_code, 200)
        self.assertEqual(self.sign_in().status_code, 401)
        # a retry of the same change gets the first answer, not "wrong password"
        self.assertEqual(self.change(key="password-key-1").status_code, 200)

    def test_the_current_password_must_be_right(self):
        answer = self.change(current="not the password at all")
        self.assertEqual((answer.status_code, self.error(answer)), (400, "wrong_password"))
        self.assertTrue(StudentAccount.objects.get(pk=self.student_account.pk).check_password(PASSWORD))

    def test_the_portals_rules_apply(self):
        self.assertEqual(self.error(self.change(new="short")), "weak_password")
        self.assertEqual(self.error(self.change(new="1234567890123456")), "weak_password")
        self.assertEqual(self.error(self.change(new=PASSWORD)), "same_password")

    def test_wrong_guesses_are_limited(self):
        for _ in range(10):
            self.change(current="a wrong guess, again")
        self.assertEqual(self.error(self.change()), "rate_limited")

    def test_staff_and_admins_can_too_but_parents_have_no_password(self):
        staff = session_token(AppSession.STAFF, self.staff_account, self.school)
        self.assertEqual(self.change(token=staff).status_code, 200)
        parent = session_token(AppSession.PARENT, self.guardian, self.school)
        self.assertEqual(self.change(token=parent).status_code, 403)
