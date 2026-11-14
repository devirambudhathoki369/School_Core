"""Closing an account from the app, and the OpenAPI schema (mobile/SPEC.md §5)."""
from django.test import TestCase

from account.models import StaffAccount, StudentAccount
from main.models.Guardian import Guardian
from mobileapi.guardians import issue_family_code
from mobileapi.models import AppSession, FamilyCode

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token


class CloseAccountTests(MobileTestMixin, WriteMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def close(self, token, confirm=True):
        return self.api(token).post("/api/mobile/v1/me/close-account", {"confirm": confirm}, format="json")

    def test_a_student_closes_their_account_and_every_phone_is_signed_out(self):
        token = session_token(AppSession.STUDENT, self.student_account, self.school)
        other_phone = session_token(AppSession.STUDENT, self.student_account, self.school)
        answer = self.close(token)
        self.assertEqual(answer.status_code, 200, answer.content)
        account = StudentAccount.objects.get(pk=self.student_account.pk)
        self.assertFalse(account.verified)
        self.assertFalse(account.has_usable_password())
        self.assertIsNotNone(account.deletion_requested_at)
        self.assertFalse(AppSession.objects.filter(student_account=account, revoked_at__isnull=True).exists())
        self.assertEqual(AppSession.objects.filter(student_account=account).first().revoke_reason,
                         AppSession.ACCOUNT_CLOSED)
        self.assertEqual(self.get("me", other_phone).status_code, 401)
        self.assertEqual(self.sign_in().status_code, 401)

    def test_staff_close_theirs_the_same_way(self):
        token = session_token(AppSession.STAFF, self.staff_account, self.school)
        self.assertEqual(self.close(token).status_code, 200)
        self.assertFalse(StaffAccount.objects.get(pk=self.staff_account.pk).verified)

    def test_a_parent_loses_the_email_sign_in_but_the_school_keeps_the_links(self):
        token = session_token(AppSession.PARENT, self.guardian, self.school)
        issue_family_code(self.guardian, admin=self.admin_account)
        self.assertEqual(self.close(token).status_code, 200)
        guardian = Guardian.objects.get(pk=self.guardian.pk)
        self.assertIsNone(guardian.email)
        self.assertTrue(guardian.student_links.exists())
        self.assertFalse(FamilyCode.objects.filter(guardian=guardian, revoked_at__isnull=True).exists())
        self.assertEqual(self.get("me", token).status_code, 401)

    def test_it_needs_confirming_and_is_not_for_the_school_admin(self):
        token = session_token(AppSession.STUDENT, self.student_account, self.school)
        self.assertEqual(self.close(token, confirm=False).status_code, 400)
        self.assertEqual(self.get("me", token).status_code, 200)
        admin = session_token(AppSession.ADMIN, self.admin_account, self.school)
        self.assertEqual(self.close(admin).status_code, 403)


class SchemaTests(MobileTestMixin, TestCase):
    def test_every_endpoint_is_in_the_schema_with_its_answer(self):
        from mobileapi import urls

        answer = self.api().get("/api/mobile/v1/schema", {"format": "json"})
        self.assertEqual(answer.status_code, 200)
        schema = answer.json()
        self.assertTrue(schema["openapi"].startswith("3."))
        documented = set(schema["paths"])
        for pattern in urls.urlpatterns:
            if pattern.name == "schema":
                continue
            route = "/" + str(pattern.pattern).replace("<int:", "{").replace("<str:", "{").replace("<uuid:", "{")
            route = route.replace(">", "}")
            self.assertIn(route, documented)
            for method, operation in schema["paths"][route].items():
                codes = set(operation["responses"])
                self.assertTrue(codes & {"200", "201", "202", "204"}, f"{method} {route} has no answer")


class SchemaFileTests(MobileTestMixin, TestCase):
    def test_check_passes_on_a_fresh_file_and_fails_on_a_stale_one(self):
        import os
        import tempfile

        from django.core.management import CommandError, call_command

        with tempfile.TemporaryDirectory() as folder:
            path = os.path.join(folder, "openapi.json")
            call_command("mobile_schema", path, stderr=open(os.devnull, "w"))
            call_command("mobile_schema", path, check=True, stderr=open(os.devnull, "w"))
            with open(path, "a", encoding="utf-8") as stale:
                stale.write(" ")
            with self.assertRaises(CommandError):
                call_command("mobile_schema", path, check=True, stderr=open(os.devnull, "w"))

    def test_the_apps_schema_file_is_up_to_date(self):
        import os

        from django.conf import settings
        from django.core.management import call_command

        path = os.path.join(settings.BASE_DIR, "..", "mobile", "src", "api", "openapi.json")
        if os.path.exists(path):  # a backend checked out on its own has no app
            call_command("mobile_schema", path, check=True, stderr=open(os.devnull, "w"))
