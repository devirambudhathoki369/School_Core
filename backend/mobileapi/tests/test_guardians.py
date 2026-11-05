"""Filling parents from student records, and following later changes."""
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from main.models.FiscalYears import EconomicYear
from main.models.Guardian import Guardian, StudentGuardian
from mobileapi.guardians import link_school, normalize_email, normalize_phone

from .helpers import MobileFixtures, MobileTestMixin


class NormalizeTests(TestCase):
    def test_numbers_and_emails(self):
        self.assertEqual(normalize_phone("+977-9811111111"), "9811111111")
        self.assertEqual(normalize_phone(" 981 111 1111 "), "9811111111")
        self.assertIsNone(normalize_phone("014000000"))
        self.assertIsNone(normalize_phone(""))
        self.assertEqual(normalize_email(" A@B.Com "), "a@b.com")
        self.assertIsNone(normalize_email("a@b"))


class LinkGuardiansTests(MobileTestMixin, TestCase):
    @classmethod
    def setUpTestData(cls):
        year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.school = MobileFixtures.school("one", year, "ONE001")
        make = MobileFixtures.student
        cls.asha = make(cls.school, "Asha", phone="9811111111", email="Hari@Example.com")
        cls.bina = make(cls.school, "Bina", phone="9811111111")
        cls.cora = make(cls.school, "Cora", last_name="Thapa", phone="9822222222")
        cls.dev = make(cls.school, "Dev", last_name="Rai", phone="9822222222")
        cls.eka = make(cls.school, "Eka", phone="0140000000")

    def test_siblings_on_one_number_are_linked_and_strangers_wait_for_review(self):
        report = link_school(self.school)
        self.assertEqual((report.students, report.not_mobile, report.guardians_new), (5, 1, 2))
        self.assertEqual((report.links_linked, report.links_review), (2, 2))
        family = Guardian.objects.get(phone="9811111111")
        self.assertEqual(family.name, "Hari Pun")
        self.assertEqual(family.email, "hari@example.com")
        linked = StudentGuardian.objects.filter(guardian=family)
        self.assertTrue(all(l.state == StudentGuardian.LINKED and l.is_primary for l in linked))
        shared = StudentGuardian.objects.filter(guardian__phone="9822222222")
        self.assertTrue(all(l.state == StudentGuardian.NEEDS_REVIEW and not l.is_primary for l in shared))

    def test_running_it_twice_changes_nothing(self):
        link_school(self.school)
        again = link_school(self.school)
        self.assertEqual((again.guardians_new, again.links_linked, again.links_review, again.emails_set), (0, 0, 0, 0))

    def test_a_school_decision_survives_a_rerun(self):
        link_school(self.school)
        StudentGuardian.objects.filter(student=self.cora).update(state=StudentGuardian.REJECTED, decided_at="2026-11-05T00:00:00Z")
        link_school(self.school)
        self.assertEqual(StudentGuardian.objects.get(student=self.cora).state, StudentGuardian.REJECTED)

    def test_the_command_writes_only_with_apply(self):
        out = StringIO()
        call_command("link_guardians", stdout=out)
        self.assertIn("Nothing written", out.getvalue())
        self.assertEqual(Guardian.objects.count(), 0)
        call_command("link_guardians", "--apply", stdout=StringIO())
        self.assertEqual(Guardian.objects.count(), 2)

    def test_changing_a_students_number_moves_the_link(self):
        link_school(self.school)
        with self.captureOnCommitCallbacks(execute=True):
            info = self.bina.guardian_info
            info.guardian_contact = "9833333333"
            info.save()
        bina = StudentGuardian.objects.get(student=self.bina)
        self.assertEqual(bina.guardian.phone, "9833333333")
        self.assertEqual(bina.state, StudentGuardian.LINKED)
        self.assertTrue(bina.is_primary)
        self.assertFalse(StudentGuardian.objects.filter(student=self.bina, guardian__phone="9811111111").exists())

    def test_a_link_the_school_added_is_kept_when_the_number_changes(self):
        link_school(self.school)
        extra = Guardian.objects.create(school=self.school, phone="9866666666")
        StudentGuardian.objects.create(
            student=self.asha, guardian=extra, relation=2, state=1, source=StudentGuardian.BY_SCHOOL,
            decided_at="2026-11-05T00:00:00Z",
        )
        with self.captureOnCommitCallbacks(execute=True):
            info = self.asha.guardian_info
            info.guardian_contact = "9877777777"
            info.save()
        self.assertTrue(StudentGuardian.objects.filter(student=self.asha, guardian=extra).exists())

    def test_schools_without_the_app_are_left_alone(self):
        self.school.uses_mobile_app = False
        self.school.save(update_fields=["uses_mobile_app"])
        with self.captureOnCommitCallbacks(execute=True):
            MobileFixtures.student(self.school, "Fio", phone="9888888888")
        self.assertFalse(Guardian.objects.exists())
