import io

from django.core.management import call_command
from django.db import connection
from django.test import TestCase

from account.models import AdminAccount
from main.management.commands.normalization_cleanup import Cleanup, undo_changes
from main.models.Attendance import ClassAttendance, StudentAttendance
from main.models.ClassInfo import ClassInfo
from main.models.ClassPeriod import ClassPeriod
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StudentInvoice
from main.models.Normalized import CleanupChange
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo
from main.models.Subject import Subject
from main.models.exams.GradingRules import GradingRules

RULES = (
    "uniq_class_attendance_per_day", "uniq_timetable_per_class_year", "uniq_grading_rules_per_type",
    "uniq_sms_template_per_type", "uniq_subject_per_class", "uniq_student_receipt_number",
)


class CleanupTests(TestCase):
    """Duplicates can only exist with their rules off, as on a database not yet cleaned."""

    @classmethod
    def setUpTestData(cls):
        cls.ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.one, cls.one_year = cls.school("one")
        cls.two, cls.two_year = cls.school("two")
        cls.klass = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=2, grade=4)
        cls.asha = cls.student("Asha")
        cls.bina = cls.student("Bina")

    @classmethod
    def school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email=f"{tag}@example.com", account=AdminAccount.objects.create(username=f"admin-{tag}"),
            economic_year=cls.ey,
        )
        return school, AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")

    @classmethod
    def student(cls, first_name):
        return Student.objects.create(
            first_name=first_name, last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=cls.klass, academic_year=cls.one_year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )

    def setUp(self):
        with connection.cursor() as cursor:
            cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
            for rule in RULES:
                cursor.execute(f"DROP INDEX IF EXISTS {rule}")
            cursor.execute("ALTER TABLE main_subject DROP CONSTRAINT IF EXISTS tn_main_subject_class_info_id")
            cursor.execute("ALTER TABLE main_student DROP CONSTRAINT IF EXISTS chk_main_student_birth_date_bsdate")
            cursor.execute("ALTER TABLE main_studentinvoice DROP CONSTRAINT IF EXISTS tn_main_studentinvoice_academic_year_id")

    def sheet(self, **marks):
        roll = ClassAttendance.objects.create(school=self.one, class_info=self.klass, date="2083-07-01")
        for name, status in marks.items():
            StudentAttendance.objects.create(class_attendance=roll, student=getattr(self, name), status=status)
        return roll

    def run_step(self, name, apply=True):
        cleanup = Cleanup(apply)
        getattr(cleanup, name)()
        return cleanup

    def test_a_dry_run_changes_nothing(self):
        first, second = self.sheet(asha=True), self.sheet(asha=False)
        cleanup = self.run_step("attendance_sheets", apply=False)
        self.assertEqual(ClassAttendance.objects.filter(is_active=True).count(), 2)
        self.assertEqual(CleanupChange.objects.count(), 0)
        self.assertTrue(cleanup.counts["attendance sheets"])

    def test_two_sheets_become_one_and_present_wins(self):
        full = self.sheet(asha=False, bina=False)
        other = self.sheet(asha=True)
        self.run_step("attendance_sheets")
        full.refresh_from_db()
        other.refresh_from_db()
        self.assertTrue(full.is_active)
        self.assertFalse(other.is_active)
        marks = dict(
            StudentAttendance.objects.filter(class_attendance=full, is_active=True).values_list("student__first_name", "status")
        )
        self.assertEqual(marks, {"Asha": True, "Bina": False})

    def test_a_student_only_on_the_other_sheet_moves_across(self):
        full = self.sheet(asha=False, bina=False)
        self.sheet(asha=False)
        extra = self.student("Chandra")
        other = ClassAttendance.objects.filter(is_active=True).exclude(pk=full.pk).get()
        StudentAttendance.objects.create(class_attendance=other, student=extra, status=True)
        StudentAttendance.objects.filter(class_attendance=other, student=self.asha).delete()
        self.run_step("attendance_sheets")
        self.assertTrue(StudentAttendance.objects.filter(class_attendance=full, student=extra, status=True).exists())

    def test_undo_puts_every_value_back(self):
        full = self.sheet(asha=False, bina=False)
        other = self.sheet(asha=True)
        cleanup = self.run_step("attendance_sheets")
        self.assertGreater(undo_changes(cleanup.batch), 0)
        other.refresh_from_db()
        self.assertTrue(other.is_active)
        self.assertEqual(StudentAttendance.objects.get(class_attendance=full, student=self.asha).status, False)
        self.assertEqual(CleanupChange.objects.count(), 0)

    def test_grading_keeps_the_row_the_results_read_which_is_the_oldest(self):
        read_today = GradingRules.objects.create(school=self.one, type=1, rules=[{"a": 1}])
        newer = GradingRules.objects.create(school=self.one, type=1, rules=[{"a": 2}])
        self.assertEqual(GradingRules.objects.filter(school=self.one, type=1, is_active=True).first(), read_today)
        cleanup = Cleanup(True)
        cleanup.keep_one("grading rules", "main_gradingrules", "school_id, type", newest=False)
        newer.refresh_from_db()
        read_today.refresh_from_db()
        self.assertFalse(newer.is_active)
        self.assertTrue(read_today.is_active)

    def test_timetables_keep_the_newest_which_is_what_marks_entry_reads(self):
        old = ClassPeriod.objects.create(class_info=self.klass, academic_year=self.one_year, period_count=1, subjects={}, teachers={})
        new = ClassPeriod.objects.create(class_info=self.klass, academic_year=self.one_year, period_count=2, subjects={}, teachers={})
        Cleanup(True).keep_one("timetables", "main_classperiod", "class_info_id, academic_year_id")
        old.refresh_from_db()
        new.refresh_from_db()
        self.assertFalse(old.is_active)
        self.assertTrue(new.is_active)

    def test_a_malformed_date_is_padded_and_logged(self):
        with connection.cursor() as cursor:
            cursor.execute("UPDATE main_student SET birth_date = '2073-4-31' WHERE id = %s", [self.asha.pk])
        self.run_step("malformed_dates")
        self.asha.refresh_from_db()
        self.assertEqual(self.asha.birth_date, "2073-04-31")
        logged = CleanupChange.objects.get(table_name="main_student", row_id=self.asha.pk)
        self.assertEqual(logged.old_value, "2073-4-31")

    def test_a_subject_on_another_schools_class_moves_to_the_same_class_at_home(self):
        home = ClassInfo.objects.create(school=self.two, academic_year=self.two_year, education_level=2, grade=4)
        crossed = Subject.objects.create(school=self.two, class_info=self.klass, subject="Maths", type=1, order=1, code="M1", credit_hours=4)
        self.run_step("crossed_subjects")
        crossed.refresh_from_db()
        self.assertEqual(crossed.class_info_id, home.pk)

    def test_a_subject_with_no_class_at_home_is_left_for_the_school(self):
        crossed = Subject.objects.create(school=self.two, class_info=self.klass, subject="Maths", type=1, order=1, code="M1", credit_hours=4)
        self.run_step("crossed_subjects")
        crossed.refresh_from_db()
        self.assertEqual(crossed.class_info_id, self.klass.pk)

    def test_a_receipt_on_another_schools_year_moves_to_the_same_year_at_home(self):
        receipt = StudentInvoice.objects.create(
            invoice_id=1, school=self.two, academic_year=self.one_year, economic_year=self.ey, details={},
            total_paid=0, payment_month=1, date="2083-07-01",
        )
        self.run_step("crossed_receipts")
        receipt.refresh_from_db()
        self.assertEqual(receipt.academic_year_id, self.two_year.pk)

    def test_a_duplicate_subject_with_marks_is_never_retired(self):
        used = Subject.objects.create(school=self.one, class_info=self.klass, subject="Maths", type=1, order=1, code="M1", credit_hours=4)
        spare = Subject.objects.create(school=self.one, class_info=self.klass, subject="Maths", type=1, order=2, code="M2", credit_hours=4)
        with connection.cursor() as cursor:
            cursor.execute("INSERT INTO main_classperiodslot (class_period_id, period_no, subject_id) "
                           "SELECT %s, 1, %s", [ClassPeriod.objects.create(class_info=self.klass, academic_year=self.one_year, period_count=1, subjects={}, teachers={}).pk, used.pk])
        self.run_step("idle_subjects")
        used.refresh_from_db()
        spare.refresh_from_db()
        self.assertTrue(used.is_active)
        self.assertFalse(spare.is_active)

    def test_the_report_lists_what_needs_a_person(self):
        out = io.StringIO()
        call_command("normalization_cleanup", "--report", stdout=out)
        self.assertIn("Duplicate fee titles", out.getvalue())
