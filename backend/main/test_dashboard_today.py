from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from account.models import AdminAccount
from main.models.Attendance import ClassAttendance, StudentAttendance
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.Invoice import StudentInvoice
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Section import Section
from main.models.Student import Student, StudentGuardianInfo
from main.views.school.SchoolDashView import (
    SchoolAttendanceTodayView,
    class_label,
    collected_on,
)

TODAY = "2083-07-13"


class ClassLabelTests(TestCase):
    def test_grades_are_said_the_way_a_school_says_them(self):
        self.assertEqual(class_label(16, None), "Play group")
        self.assertEqual(class_label(1, None), "Nursery")
        self.assertEqual(class_label(3, None), "UKG")
        # GRADE_CHOICES numbers "one" as 4 and "twelve" as 15
        self.assertEqual(class_label(4, None), "Class 1")
        self.assertEqual(class_label(15, None), "Class 12")

    def test_a_course_names_the_class_beside_or_instead_of_its_grade(self):
        self.assertEqual(class_label(14, "Science"), "Class 11 · Science")
        self.assertEqual(class_label(None, "BBS"), "BBS")
        self.assertEqual(class_label(None, None), "Other")


class DashboardTodayTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school, cls.year = cls.make_school("one")
        cls.other, cls.other_year = cls.make_school("two")
        a = Section.objects.create(section="A", school=cls.school)
        b = Section.objects.create(section="B", school=cls.school)
        # Class 1 in two sections, Nursery, and Play group — out of school order
        cls.one_a = cls.klass(cls.school, cls.year, grade=4, section=a)
        cls.one_b = cls.klass(cls.school, cls.year, grade=4, section=b)
        cls.nursery = cls.klass(cls.school, cls.year, grade=1)
        cls.play = cls.klass(cls.school, cls.year, grade=16)
        cls.elsewhere = cls.klass(cls.other, cls.other_year, grade=4)

        cls.asha = cls.student(cls.one_a, "Asha")
        cls.bina = cls.student(cls.one_b, "Bina")
        cls.chet = cls.student(cls.one_b, "Chet")
        cls.dipa = cls.student(cls.nursery, "Dipa")
        cls.student(cls.play, "Ekta")
        cls.left = cls.student(cls.one_a, "Gita", status=2)
        cls.outsider = cls.student(cls.elsewhere, "Hari")

        cls.mark(cls.asha, TODAY, True)
        cls.mark(cls.asha, TODAY, True)          # a card punch over the paper roll
        cls.mark(cls.bina, TODAY, False)         # absent
        cls.mark(cls.chet, "2083-07-12", True)   # yesterday
        cls.mark(cls.dipa, TODAY, True)
        cls.mark(cls.left, TODAY, True)          # no longer a running student
        cls.mark(cls.outsider, TODAY, True)      # another school

    @classmethod
    def make_school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email=f"{tag}@example.com",
            account=AdminAccount.objects.create(username=f"admin-{tag}"), economic_year=cls.fy,
        )
        year = AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        return school, year

    @classmethod
    def klass(cls, school, year, **details):
        return ClassInfo.objects.create(school=school, academic_year=year, education_level=2, **details)

    @classmethod
    def student(cls, klass, first, status=1):
        return Student.objects.create(
            first_name=first, last_name="Pun", birth_date="2070-01-01", gender=2, status=status,
            location="Tulsipur", class_info=klass, academic_year=klass.academic_year,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name=f"Father of {first}", mother_name="Mother Name", guardian_contact="9800000000",
            ),
        )

    @classmethod
    def mark(cls, student, date, status):
        roll, _ = ClassAttendance.objects.get_or_create(date=date, class_info=student.class_info, school=student.class_info.school)
        return StudentAttendance.objects.create(class_attendance=roll, student=student, status=status, reason="")

    def attendance(self):
        with patch("main.views.school.SchoolDashView.ndt_today", return_value=TODAY):
            return SchoolAttendanceTodayView().get(SimpleNamespace(query_params={"school": self.school.id})).data

    def test_the_whole_school_and_each_class(self):
        data = self.attendance()
        self.assertEqual(data["students"], {"total": 5, "present": 2, "absent": 3})
        self.assertEqual(data["classes"], [
            {"name": "Play group", "total": 1, "present": 0, "absent": 1},
            {"name": "Nursery", "total": 1, "present": 1, "absent": 0},
            # both sections together; Asha's two rows count once, Bina was absent
            {"name": "Class 1", "total": 3, "present": 1, "absent": 2},
        ])

    def test_the_classes_add_up_to_the_school(self):
        data = self.attendance()
        self.assertEqual(sum(c["total"] for c in data["classes"]), data["students"]["total"])
        self.assertEqual(sum(c["present"] for c in data["classes"]), data["students"]["present"])

    def receipt(self, school, year, amount, date=TODAY, mode=1, **fields):
        return StudentInvoice.objects.create(
            invoice_id=StudentInvoice.objects.count() + 1, date=date, total_paid=Decimal(amount),
            payment_month=7, school=school, academic_year=year, economic_year=self.fy, mode=mode, **fields,
        )

    def test_collected_today_is_todays_receipts_alone(self):
        self.receipt(self.school, self.year, "4050.00")
        self.receipt(self.school, self.year, "1800.00", mode=2)
        self.receipt(self.school, self.year, "600.00")
        self.receipt(self.school, self.year, "9400.00", date="2083-07-12")       # yesterday
        self.receipt(self.school, self.year, "700.00", is_active=False)          # cancelled
        self.receipt(self.other, self.other_year, "5000.00")                     # another school

        today = collected_on(self.school.id, TODAY)
        self.assertEqual(today["amount"], Decimal("6450.00"))
        self.assertEqual(today["receipts"], 3)
        self.assertEqual(today["by_mode"], [
            {"mode": 1, "label": "cash", "amount": Decimal("4650.00")},
            {"mode": 2, "label": "bank", "amount": Decimal("1800.00")},
        ])

    def test_a_day_with_nothing_collected(self):
        self.assertEqual(collected_on(self.school.id, TODAY), {"date": TODAY, "amount": Decimal("0"), "receipts": 0, "by_mode": []})


class ConsoleSchoolListTests(TestCase):
    """The superadmin dashboard reads its estate figures from /api/admins."""

    def test_each_school_carries_what_the_console_counts(self):
        from main.views.school.SchoolAdminView import SchoolAdminView

        fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        SchoolAdmin.objects.create(
            name="School one", address="Test address", estd_date="2080-01-01", renew_date="2083-07-20",
            pan_no="123", email="one@example.com", account=AdminAccount.objects.create(username="admin-one"),
            economic_year=fy, uses_sms=True, ui_theme="laliguras",
        )
        row = dict(SchoolAdminView().get(SimpleNamespace(query_params={})).data[0])
        self.assertEqual(
            {key: row.get(key) for key in ("renew_date", "uses_sms", "uses_mobile_app", "test_account", "ui_theme", "uses_hostel")},
            {"renew_date": "2083-07-20", "uses_sms": True, "uses_mobile_app": False,
             "test_account": False, "ui_theme": "laliguras", "uses_hostel": False},
        )
