"""Every endpoint has a rate limit, and the places where passwords or keys
could be guessed lock out (account/throttles.py, account/admin_login.py)."""
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.urls import URLResolver, get_resolver
from rest_framework.test import APIClient
from rest_framework.views import APIView

from account.throttles import AnonymousIPThrottle
from main.test_digital_id import DigitalIdTests
from main.models.FiscalYears import EconomicYear
from rfid.models.Device import Device


def _routes(patterns, prefix=""):
    for pattern in patterns:
        if isinstance(pattern, URLResolver):
            yield from _routes(pattern.url_patterns, prefix + str(pattern.pattern))
        else:
            yield prefix + str(pattern.pattern), pattern.callback


class EveryEndpointIsLimitedTests(TestCase):
    def test_every_api_view_has_a_rate_limit(self):
        missing = []
        for route, callback in _routes(get_resolver().url_patterns):
            view = getattr(callback, "view_class", None) or getattr(callback, "cls", None)
            if view is None or not issubclass(view, APIView):
                continue
            if not view().get_throttles():
                missing.append(f"{route} ({view.__module__}.{view.__name__})")
        self.assertEqual(missing, [], "API views without a rate limit")

    def test_a_view_without_its_own_limit_gets_the_default(self):
        cache.clear()
        self.addCleanup(cache.clear)
        client = APIClient()
        with mock.patch.object(AnonymousIPThrottle, "rate", "2/min"):
            answers = [client.get("/api/app/listing/public").status_code for _ in range(3)]
        self.assertEqual(answers[-1], 429, answers)
        self.assertNotIn(429, answers[:2])


class SecurityHeaderTests(TestCase):
    def test_json_answers_cannot_run_or_be_framed(self):
        answer = APIClient().get("/api/app/listing/public")
        self.assertIn("default-src 'none'", answer["Content-Security-Policy"])
        self.assertIn("frame-ancestors 'none'", answer["Content-Security-Policy"])
        self.assertIn("camera=()", answer["Permissions-Policy"])
        self.assertEqual(answer["X-Content-Type-Options"], "nosniff")


@override_settings(DEBUG=False, ALLOWED_HOSTS=["testserver"])
class AdminSignInLockoutTests(TestCase):
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.user = get_user_model().objects.create_superuser("root-admin", "root@example.com", "a long admin passphrase")

    def sign_in(self, password, username="root-admin", client=None):
        client = client or self.client_class(enforce_csrf_checks=False)
        return client.post("/admin/login/?next=/admin/", {"username": username, "password": password})

    def test_ten_wrong_passwords_lock_the_username(self):
        for _ in range(10):
            self.assertEqual(self.sign_in("wrong").status_code, 200)
        locked = self.sign_in("a long admin passphrase")
        self.assertEqual(locked.status_code, 429)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_a_good_password_signs_in_and_clears_the_count(self):
        for _ in range(9):
            self.sign_in("wrong")
        self.assertEqual(self.sign_in("a long admin passphrase").status_code, 302)
        self.assertEqual(self.sign_in("wrong").status_code, 200)  # counting again from one

    def test_one_address_trying_many_usernames_is_stopped(self):
        for n in range(30):
            self.sign_in("wrong", username=f"guess-{n}")
        self.assertEqual(self.sign_in("a long admin passphrase").status_code, 429)


class ReaderKeyLockoutTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        school = DigitalIdTests.school("gate", year)
        cls.device = Device.objects.create(serial_number="UHF-GATE-1", school=school, reader_kind=Device.KIND_UHF,
                                           reader_key="k" * 40)

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)

    def scan(self, key, reader="UHF-GATE-1"):
        return APIClient().post("/rfid/scan", {"reader_id": reader, "epc": "E200001"}, format="json",
                                HTTP_X_READER_KEY=key)

    def test_wrong_keys_from_one_address_are_stopped(self):
        for n in range(15):
            self.assertEqual(self.scan(f"guess-{n}").status_code, 403)
            self.assertEqual(self.scan("x", reader=f"UNKNOWN-{n}").status_code, 403)
        self.assertEqual(self.scan("k" * 40).status_code, 429)

    def test_a_key_with_other_characters_is_refused_not_an_error(self):
        self.assertEqual(self.scan("ключ").status_code, 403)

    def test_a_body_that_is_not_an_object_is_refused(self):
        answer = APIClient().post("/rfid/scan", ["x"], format="json", HTTP_X_READER_KEY="k" * 40)
        self.assertEqual(answer.status_code, 400)
