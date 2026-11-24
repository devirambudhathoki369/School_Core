"""Answers to malformed input that were server errors when every route was
sent junk on a copy of the demo data (backend/docs/RATE_LIMITS.md, "Bad
input"). Each is now the caller's 400, and the paths that work keep working."""
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from account.models import StaffAccount
from main import test_digital_id as fixtures
from main.models.FiscalYears import EconomicYear
from main.models.Staff import Staff, StaffRole


class MalformedInputTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.school = fixtures.DigitalIdTests.school("input", cls.year)
        cls.token = AdminAuthToken.issue(cls.school.account).key
        Staff.objects.create(
            account=StaffAccount.objects.create(username="input-staff"), school=cls.school,
            role=StaffRole.objects.create(role="Teacher"), first_name="Sita", last_name="Rai",
            primary_contact="9800000000", location="Test",
        )

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"IGNITE {self.token}")

    def test_a_fee_that_is_not_a_fee_is_a_bad_request(self):
        for body in ([], "x", {}, {"class_info": 0, "school": self.school.id}):
            with self.subTest(body=body):
                answer = self.client.post("/api/fees", body, format="json")
                self.assertEqual(answer.status_code, 400, answer.content)

    def test_a_fee_title_that_is_not_one_is_a_bad_request(self):
        answer = self.client.post("/api/fees/titles", {"school": self.school.id}, format="json")
        self.assertEqual(answer.status_code, 400, answer.content)

    def test_certificates_need_a_school(self):
        self.assertEqual(self.client.get("/api/character_certificate").status_code, 400)
        answer = self.client.get("/api/character_certificate", {"school": self.school.id})
        self.assertEqual(answer.status_code, 200, answer.content)

    def test_staff_search_with_balances_answers_named_fields_only(self):
        body = {"school": self.school.id, "include_balance": True, "economic_year": self.year.id, "detailed": True}
        answer = self.client.post("/api/search/staffs", body, format="json")
        self.assertEqual(answer.status_code, 200, answer.content)
        row = answer.json()[0]
        self.assertEqual(row["name"].split()[0], "Sita")
        self.assertEqual(float(row["balance"]), 0.0)
        self.assertNotIn("account", row)
        self.assertNotIn("permissions", row)


class NulCharacterTests(TestCase):
    """PostgreSQL cannot store or compare a NUL character, so one in a query
    string failed inside whichever view read it."""

    def test_a_nul_in_the_address_or_query_is_refused_everywhere(self):
        for path in ("/api/app/listing/public?x=%00", "/iclock/ping?SN=%00", "/api/mobile/v1/schools/DEMO%00",
                     "/auth/signin?role=%00"):
            with self.subTest(path=path):
                answer = APIClient().get(path)
                self.assertEqual(answer.status_code, 400)
                self.assertIn("Permissions-Policy", answer)

    def test_a_terminal_that_registers_with_a_nul_in_its_report_is_answered(self):
        from rfid.models.Device import Device

        year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        school = fixtures.DigitalIdTests.school("nul", year)
        Device.objects.create(serial_number="NULZK0001", school=school)
        with self.settings(ICLOCK_REQUIRE_PUSH_KEY=False):
            answer = self.client.post("/iclock/registry?SN=NULZK0001", b"~DeviceName=gate\x00one\x00",
                                      content_type="text/plain")
        self.assertEqual(answer.status_code, 200, answer.content)
