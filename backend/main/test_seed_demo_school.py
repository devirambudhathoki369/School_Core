from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from account.models import AdminAccount, SuperAdminAccount
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin


class SeedDemoSchoolTests(TestCase):
    def test_it_refuses_a_database_that_already_has_a_school(self):
        SchoolAdmin.objects.create(
            name="A real school", address="Tulsipur", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email="real@example.com", account=AdminAccount.objects.create(username="real"),
            economic_year=EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31"),
        )
        with self.assertRaises(CommandError):
            call_command("seed_demo_school")
        self.assertEqual(SchoolAdmin.objects.count(), 1)
        self.assertFalse(SuperAdminAccount.objects.exists())
