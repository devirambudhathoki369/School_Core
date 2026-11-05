"""The opening-balance report names its year, or is refused (LedgerView).

Without `academic_year` the request fell through to the paged list of
postings, and the report page summed that list as if it were the report.
"""

from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from account.models import AdminAccount
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin


class OpeningBalanceReportRequestTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school = SchoolAdmin.objects.create(
            name="Opening Balance School", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email="obr@example.com",
            account=AdminAccount.objects.create(username="opening-balance"), economic_year=year,
        )

    def setUp(self):
        # an API call leaves its audit context behind (see test_payroll_close)
        self.addCleanup(users_context.set, None)
        self.admin = APIClient()
        token = AdminAuthToken.objects.create(user=self.school.account)
        self.admin.credentials(HTTP_AUTHORIZATION=f"IGNITE {token.key}")

    def test_without_a_year_the_report_is_refused(self):
        for extra in ({}, {"waived": "true"}):
            with self.subTest(**extra):
                response = self.admin.get("/api/ledgers", {
                    "school": self.school.id, "opening_balance_report": "true", "academic_year": "", **extra,
                })
                self.assertEqual(response.status_code, 400)
                self.assertNotIn("results", response.data)
