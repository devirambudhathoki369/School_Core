"""Signing in with a password, tokens and sessions (mobile/SPEC.md §2–3)."""
from unittest.mock import patch

from django.test import TestCase, override_settings

from mobileapi.models import AppSession, RefreshToken
from mobileapi.tokens import MAX_SESSIONS_PER_ACCOUNT

from .helpers import MobileFixtures, MobileTestMixin


class SchoolCodeTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def test_the_code_finds_the_school_in_any_case(self):
        answer = self.get("schools/one001")
        self.assertEqual(answer.status_code, 200, answer.content)
        self.assertEqual(answer.json()["school"]["name"], "School one")
        self.assertEqual(answer.json()["sign_in"]["parent"], "email_code")

    def test_an_unknown_code_or_a_school_without_the_app_is_not_found(self):
        self.assertEqual(self.error(self.get("schools/NOPE99")), "school_not_found")
        self.school.uses_mobile_app = False
        self.school.save(update_fields=["uses_mobile_app"])
        self.assertEqual(self.get("schools/ONE001").status_code, 404)


class PasswordSignInTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def test_each_role_signs_in_and_sees_itself(self):
        for role, username, name in (
            ("student", "asha-pun", "Asha Pun"), ("staff", "teacher-one", "Sita Rai"), ("admin", "admin-one", "School one"),
        ):
            with self.subTest(role=role):
                answer = self.sign_in(role=role, username=username)
                self.assertEqual(answer.status_code, 200, answer.content)
                body = answer.json()
                self.assertEqual(body["me"]["role"], role)
                self.assertEqual(body["me"]["profile"]["name"], name)
                self.assertEqual(body["tokens"]["token_type"], "Bearer")
                me = self.get("me", body["tokens"]["access_token"])
                self.assertEqual(me.status_code, 200, me.content)
                self.assertEqual(me.json()["role"], role)
        staff = self.get("me", self.tokens(role="staff", username="teacher-one")["access_token"]).json()
        self.assertEqual(staff["permissions"], [1501, 1503])

    def test_wrong_password_other_school_or_wrong_role_all_say_the_same(self):
        for kwargs in (
            {"password": "not the password at all"},
            {"code": "TWO002"},
            {"role": "staff"},
            {"username": "nobody-here"},
        ):
            with self.subTest(**kwargs):
                answer = self.sign_in(**kwargs)
                self.assertEqual(answer.status_code, 401, answer.content)
                self.assertEqual(self.error(answer), "invalid_credentials")

    def test_staff_who_left_and_students_who_left_cannot_sign_in(self):
        self.staff.status = 2
        self.staff.save(update_fields=["status"])
        self.assertEqual(self.sign_in(role="staff", username="teacher-one").status_code, 401)
        self.student.status = 2
        self.student.save(update_fields=["status"])
        self.assertEqual(self.sign_in().status_code, 401)

    def test_ten_failures_lock_the_username(self):
        for _ in range(10):
            self.sign_in(password="wrong wrong wrong")
        answer = self.sign_in()
        self.assertEqual(answer.status_code, 429)
        self.assertEqual(self.error(answer), "locked")

    def test_a_bad_body_names_its_fields(self):
        answer = self.post("auth/signin", {"school_code": "ONE001", "role": "pilot"})
        self.assertEqual(answer.status_code, 400)
        error = answer.json()["error"]
        self.assertEqual(error["code"], "invalid")
        self.assertIn("role", error["fields"])
        self.assertIn("device", error["fields"])


class TokenTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)

    def test_no_token_a_forged_token_or_the_portal_cookie_is_refused(self):
        self.assertEqual(self.get("me").status_code, 401)
        token = self.tokens()["access_token"]
        forged = token[:-4] + ("AAAA" if not token.endswith("AAAA") else "BBBB")
        self.assertEqual(self.get("me", forged).status_code, 401)
        cookie_only = self.api()
        cookie_only.cookies["smsys"] = token
        self.assertEqual(cookie_only.get("/api/mobile/v1/me").status_code, 401)

    def test_an_access_token_expires_after_fifteen_minutes(self):
        token = self.tokens()["access_token"]
        with patch("mobileapi.tokens.time.time", return_value=__import__("time").time() + 16 * 60):
            self.assertEqual(self.get("me", token).status_code, 401)

    def test_refreshing_gives_a_new_pair_and_spends_the_old_token(self):
        first = self.tokens()
        answer = self.post("auth/refresh", {"refresh_token": first["refresh_token"]})
        self.assertEqual(answer.status_code, 200, answer.content)
        second = answer.json()["tokens"]
        self.assertNotEqual(second["refresh_token"], first["refresh_token"])
        self.assertEqual(self.get("me", second["access_token"]).status_code, 200)
        self.assertEqual(RefreshToken.objects.filter(used_at__isnull=True).count(), 1)

    def test_a_spent_refresh_token_coming_back_ends_the_session(self):
        first = self.tokens()
        second = self.post("auth/refresh", {"refresh_token": first["refresh_token"]}).json()["tokens"]
        replay = self.post("auth/refresh", {"refresh_token": first["refresh_token"]})
        self.assertEqual(replay.status_code, 401)
        self.assertEqual(self.error(replay), "refresh_refused")
        session = AppSession.objects.get()
        self.assertEqual(session.revoke_reason, AppSession.TOKEN_REUSED)
        self.assertEqual(self.get("me", second["access_token"]).status_code, 401)
        self.assertEqual(self.post("auth/refresh", {"refresh_token": second["refresh_token"]}).status_code, 401)

    def test_at_most_five_phones_the_oldest_goes(self):
        for _ in range(MAX_SESSIONS_PER_ACCOUNT + 1):
            self.tokens()
        live = AppSession.objects.filter(revoked_at__isnull=True)
        self.assertEqual(live.count(), MAX_SESSIONS_PER_ACCOUNT)
        self.assertEqual(AppSession.objects.filter(revoke_reason=AppSession.REPLACED).count(), 1)

    def test_a_password_changed_anywhere_ends_the_session(self):
        token = self.tokens()["access_token"]
        self.student_account.set_password("a brand new passphrase")
        self.student_account.save()
        self.assertEqual(self.get("me", token).status_code, 401)
        self.assertEqual(AppSession.objects.get().revoke_reason, AppSession.PASSWORD_CHANGED)

    def test_staff_who_leave_are_signed_out(self):
        token = self.tokens(role="staff", username="teacher-one")["access_token"]
        self.staff.status = 2
        self.staff.save(update_fields=["status"])
        self.assertEqual(self.get("me", token).status_code, 401)
        self.assertEqual(AppSession.objects.get().revoke_reason, AppSession.ACCESS_REMOVED)

    def test_a_school_switching_the_app_off_refuses_without_ending(self):
        token = self.tokens()["access_token"]
        self.school.uses_mobile_app = False
        self.school.save(update_fields=["uses_mobile_app"])
        self.assertEqual(self.get("me", token).status_code, 401)
        self.assertIsNone(AppSession.objects.get().revoked_at)

    def test_sign_out_this_phone_or_everywhere(self):
        one = self.tokens()["access_token"]
        two = self.tokens()["access_token"]
        self.assertEqual(self.post("auth/signout", {}, one).status_code, 204)
        self.assertEqual(self.get("me", one).status_code, 401)
        self.assertEqual(self.get("me", two).status_code, 200)
        three = self.tokens()["access_token"]
        self.assertEqual(self.post("auth/signout-all", {}, two).status_code, 204)
        self.assertEqual(self.get("me", three).status_code, 401)

    def test_the_phones_list_and_signing_one_out(self):
        one = self.tokens()["access_token"]
        self.tokens()
        listed = self.get("me/sessions", one).json()["items"]
        self.assertEqual(len(listed), 2)
        self.assertEqual(sum(item["current"] for item in listed), 1)
        other = next(item["id"] for item in listed if not item["current"])
        self.assertEqual(self.api(one).delete(f"/api/mobile/v1/me/sessions/{other}").status_code, 204)
        self.assertEqual(len(self.get("me/sessions", one).json()["items"]), 1)

    def test_someone_elses_session_cannot_be_signed_out(self):
        mine = self.tokens()["access_token"]
        self.tokens(role="staff", username="teacher-one")
        theirs = AppSession.objects.get(role=AppSession.STAFF)
        self.assertEqual(self.api(mine).delete(f"/api/mobile/v1/me/sessions/{theirs.id}").status_code, 404)
        self.assertIsNone(AppSession.objects.get(pk=theirs.pk).revoked_at)

    @override_settings(MOBILE_MIN_APP_VERSION="2.0.0")
    def test_an_old_app_is_asked_to_update(self):
        answer = self.api(HTTP_X_APP_VERSION="1.9.9").get("/api/mobile/v1/schools/ONE001")
        self.assertEqual(answer.status_code, 426)
        self.assertEqual(self.error(answer), "update_required")
        self.assertEqual(self.api(HTTP_X_APP_VERSION="2.0.0").get("/api/mobile/v1/schools/ONE001").status_code, 200)

