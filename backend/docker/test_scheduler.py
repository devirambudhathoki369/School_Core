"""No Django setup or external messages; exercise schedule/duplicate prevention."""
from datetime import datetime
import sqlite3
import tempfile
import unittest

from scheduler import ZONE, claim, due_jobs


class SchedulerTests(unittest.TestCase):
    def test_disabled_by_default(self):
        self.assertEqual(list(due_jobs(datetime(2026, 11, 2, 8, 15, tzinfo=ZONE), {})), [])

    def test_nepal_schedule_and_quarter_hour_sync(self):
        enabled = {"ENABLE_BIRTHDAY_PUSH": "true", "ENABLE_SMS_DELIVERY_SYNC": "true"}
        jobs = list(due_jobs(datetime(2026, 11, 2, 8, 15, tzinfo=ZONE), enabled))
        self.assertEqual([job[0] for job in jobs], ["ENABLE_BIRTHDAY_PUSH", "ENABLE_SMS_DELIVERY_SYNC"])
        self.assertEqual(list(due_jobs(datetime(2026, 11, 2, 8, 16, tzinfo=ZONE), enabled)), [])

    def test_restart_does_not_repeat_claim(self):
        with tempfile.TemporaryDirectory() as folder:
            path = folder + "/runs.sqlite3"
            with sqlite3.connect(path) as db:
                db.execute("CREATE TABLE runs (name TEXT, slot TEXT, PRIMARY KEY (name, slot))")
                # Use today so expiry does not remove the fixture in future runs.
                slot = datetime.now(ZONE).strftime("%Y-%m-%dT08:15")
                self.assertTrue(claim(db, "birthday", slot))
                self.assertFalse(claim(db, "birthday", slot))
            with sqlite3.connect(path) as db:
                self.assertFalse(claim(db, "birthday", slot))
                self.assertTrue(claim(db, "different-job", slot))


if __name__ == "__main__":
    unittest.main()
