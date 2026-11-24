"""The helpers every endpoint leans on: BS dates, months, money and paging."""
from django.test import SimpleTestCase, TestCase

from mobileapi.access import _decode, _encode, bs_date, bs_month, month_names, paisa
from mobileapi.errors import MobileError
from mobileapi.models import AppSession

from .helpers import MobileFixtures, MobileTestMixin, WriteMixin, session_token


class BsDateTests(SimpleTestCase):
    def test_a_date_is_written_as_the_database_holds_it(self):
        self.assertEqual(bs_date("2083-07-05"), "2083-07-05")

    def test_dates_that_are_not_in_the_calendar_are_refused(self):
        for value in ("2083-07-32", "2083-13-01", "2083-7-5", "07-05-2083", "yesterday"):
            with self.assertRaises(MobileError, msg=value):
                bs_date(value)

    def test_a_missing_date_is_today_unless_it_is_required(self):
        self.assertRegex(bs_date(None), r"^\d{4}-\d{2}-\d{2}$")
        with self.assertRaises(MobileError):
            bs_date(None, default_today=False)


class BsMonthTests(SimpleTestCase):
    def test_a_month_knows_its_length_first_weekday_and_neighbours(self):
        kartik = bs_month("2083-07")
        self.assertEqual((kartik["start"], kartik["end"], kartik["days"]), ("2083-07-01", "2083-07-30", 30))
        self.assertEqual(kartik["starts_on"], 0)  # 1 Kartik 2083 is a Sunday
        self.assertEqual(kartik["label"], "Kartik 2083")

    def test_the_year_turns_over_at_chaitra_and_baishakh(self):
        self.assertEqual(bs_month("2083-12")["next"], "2084-01")
        self.assertEqual(bs_month("2084-01")["previous"], "2083-12")

    def test_bad_months_are_refused(self):
        for value in ("2083-00", "2083-13", "1800-01", "2083-1", "Kartik"):
            with self.assertRaises(MobileError, msg=value):
                bs_month(value)


class MoneyAndPagingTests(SimpleTestCase):
    def test_rupees_become_whole_paisa_rounded_half_up(self):
        self.assertEqual(paisa("4800.00"), 480000)
        self.assertEqual(paisa("10.005"), 1001)
        self.assertEqual(paisa(None), 0)
        self.assertEqual(paisa("not money"), 0)

    def test_month_numbers_become_names(self):
        self.assertEqual(month_names([1, 7, 12]), ["Baishakh", "Kartik", "Chaitra"])
        self.assertEqual(month_names(4), ["Shrawan"])
        self.assertEqual(month_names([0, 13, "x"]), [])

    def test_a_cursor_reads_back_and_a_forged_one_is_refused(self):
        self.assertEqual(_decode(_encode(1234)), 1234)
        with self.assertRaises(MobileError):
            _decode("not-base64!!")


class ObjectBodyTests(MobileTestMixin, WriteMixin, TestCase):
    """Every write takes one object: a list, a string or a number is refused
    before any view reads it (it was a 500 on setting homework)."""

    @classmethod
    def setUpTestData(cls):
        MobileFixtures.build(cls)
        cls.teacher_token = session_token(AppSession.STAFF, cls.staff_account, cls.school)

    def test_a_write_that_is_not_an_object_is_refused(self):
        for body in ([], "x", 7):
            with self.subTest(body=body):
                answer = self.write("post", "staff/homework", body, self.teacher_token)
                self.assertEqual((answer.status_code, self.error(answer)), (400, "invalid"))
