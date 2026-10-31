import io
from datetime import timedelta
from unittest.mock import patch

from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone

from account.models import AdminAccount
from main.checks import card_readers_have_keys, database_login_has_only_the_rights_it_needs
from main.models.FiscalYears import EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.history_log.HistoryLog import HistoryLog
from rfid.models.Device import Device


class DeployCheckTests(TestCase):
    def school(self):
        ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        return SchoolAdmin.objects.create(
            name="School", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01", pan_no="123",
            email="one@example.com", account=AdminAccount.objects.create(username="admin-one"), economic_year=ey,
        )

    def test_it_warns_about_a_superuser_login(self):
        # The test database's own role is a superuser.
        self.assertEqual([w.id for w in database_login_has_only_the_rights_it_needs(None)], ["main.W001"])

    def test_it_counts_readers_with_no_key_until_keys_are_required(self):
        Device.objects.create(serial_number="ABC123", school=self.school())
        self.assertEqual([w.id for w in card_readers_have_keys(None)], ["main.W002"])
        with override_settings(ICLOCK_REQUIRE_PUSH_KEY=True):
            self.assertEqual(card_readers_have_keys(None), [])


class PruneHistoryLogTests(TestCase):
    def log(self, age_days):
        kind = ContentType.objects.get_for_model(AdminAccount)
        row = HistoryLog.objects.create(user_type=kind, user_id=1, object_type=kind, object_id=1, action=1, changes={})
        HistoryLog.objects.filter(pk=row.pk).update(timestamp=timezone.now() - timedelta(days=age_days))
        return row

    def run_it(self, *args):
        out = io.StringIO()
        call_command("prune_history_log", *args, stdout=out)
        return out.getvalue()

    def test_it_only_reports_unless_told(self):
        self.log(800)
        self.assertIn("Would delete 1", self.run_it("--days", "730"))
        self.assertEqual(HistoryLog.objects.count(), 1)

    def test_it_deletes_only_what_is_older(self):
        old, new = self.log(800), self.log(10)
        self.assertIn("Deleted 1", self.run_it("--days", "730", "--apply"))
        self.assertEqual(list(HistoryLog.objects.values_list("pk", flat=True)), [new.pk])
