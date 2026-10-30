from django.test import SimpleTestCase
from nepali_datetime import date as ndate

from main.methods.licence import renew_days_left, with_licence

TODAY = ndate(2083, 7, 13)


class RenewDaysLeftTests(SimpleTestCase):
    def test_counted_in_the_bs_calendar(self):
        # Kartik 2083 has 30 days, so Mangsir 10 is 27 days after Kartik 13
        self.assertEqual(renew_days_left("2083-08-10", TODAY), 27)
        self.assertEqual(renew_days_left("2083-07-13", TODAY), 0)
        self.assertEqual(renew_days_left("2083-07-01", TODAY), -12)
        # the date the old browser check read as AD 2084, 57 years away:
        # the rest of Kartik (17) + Mangsir..Chaitra (148) + 1
        self.assertEqual(renew_days_left("2084-01-01", TODAY), 166)

    def test_a_missing_or_unreadable_date_is_never_a_lapse(self):
        for value in (None, "", "not a date", "2083-13-40", "2083/07/13"):
            self.assertIsNone(renew_days_left(value, TODAY), value)

    def test_the_profile_carries_the_count_only_when_it_has_a_date(self):
        self.assertIn("renew_days_left", with_licence({"renew_date": "2084-01-01"}))
        self.assertEqual(with_licence({"name": "x"}), {"name": "x"})
        self.assertIsNone(with_licence(None))
