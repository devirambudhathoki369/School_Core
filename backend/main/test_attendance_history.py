from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

from django.test import TestCase

from account.models import AdminAccount
from main.models.Attendance import ClassAttendance, StaffAttendance, StudentAttendance
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Staff import Staff, StaffRole
from main.models.Student import Student, StudentGuardianInfo
from main.views.AttendanceHistoryView import AttendanceHistoryView, merge_days, month_table


def utc(hour, minute):
    return datetime(2026, 9, 20, hour, minute, tzinfo=timezone.utc)


class MonthTableTests(TestCase):
    def test_the_calendar_of_2083(self):
        table = month_table(2083)
        self.assertEqual([m["days"] for m in table], [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30])
        # Baisakh 1, 2083 is a Tuesday and Ashwin 1 a Thursday, counting from Sunday
        self.assertEqual(table[0], {"month": 1, "days": 31, "starts": 2})
        self.assertEqual(table[5]["starts"], 4)

    def test_a_year_the_calendar_does_not_cover(self):
        self.assertIsNone(month_table(9999))


class MergeDaysTests(TestCase):
    def row(self, date, status, arrived=None, left=None, reason=""):
        return {"date": date, "status": status, "checked_in_at": arrived, "checked_out_at": left, "reason": reason}

    def test_present_on_any_row_is_present(self):
        days = merge_days([
            self.row("2083-06-04", False, reason="Fever"),
            self.row("2083-06-04", True, utc(4, 0), utc(10, 30)),
            self.row("2083-06-04", True, utc(3, 56)),
        ])
        # 03:56 UTC is 9:41 in Nepal, 10:30 UTC is 16:15; the reason belongs to an absent day only
        self.assertEqual(days, [{"date": "2083-06-04", "present": True, "in": 581, "out": 975, "reason": ""}])

    def test_an_absent_day_keeps_the_first_reason_given(self):
        days = merge_days([
            self.row("2083-06-05", False, reason=""),
            self.row("2083-06-05", False, reason=" Fever "),
            self.row("2083-06-05", False, reason="Other"),
        ])
        self.assertEqual(days, [{"date": "2083-06-05", "present": False, "in": None, "out": None, "reason": "Fever"}])

    def test_a_present_day_keeps_the_note_written_beside_it(self):
        days = merge_days([
            self.row("2083-06-06", True, utc(4, 40), reason="late"),
            self.row("2083-06-07", False, reason="Sick"),
            self.row("2083-06-07", True, reason=""),
        ])
        self.assertEqual([(d["present"], d["reason"]) for d in days], [(True, "late"), (True, "")])

    def test_a_placeholder_is_not_a_reason(self):
        days = merge_days([
            self.row("2083-06-08", False, reason="undefined"),
            self.row("2083-06-09", False, reason=" None "),
            self.row("2083-06-09", False, reason="Mamaghar"),
            self.row("2083-06-10", True, reason="null"),
        ])
        self.assertEqual([d["reason"] for d in days], ["", "Mamaghar", ""])

    def test_days_come_back_in_date_order_and_bad_dates_are_left_out(self):
        days = merge_days([
            self.row("2083-06-12", True),
            self.row("", True),
            self.row(None, True),
            self.row("2083-6-1", True),
            self.row("2083-01-02", False, reason=None),
        ])
        self.assertEqual([d["date"] for d in days], ["2083-01-02", "2083-06-12"])
        self.assertEqual(days[0]["reason"], "")


class AttendanceHistoryViewTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school, cls.year = cls.make_school("one")
        cls.other, cls.other_year = cls.make_school("two")
        cls.klass = ClassInfo.objects.create(school=cls.school, academic_year=cls.year, education_level=2, grade=5)
        cls.other_klass = ClassInfo.objects.create(
            school=cls.other, academic_year=cls.other_year, education_level=2, grade=5,
        )
        cls.student = cls.make_student(cls.klass, "Asha")
        cls.quiet = cls.make_student(cls.klass, "Bina")
        cls.outsider = cls.make_student(cls.other_klass, "Chandra")
        cls.staff = Staff.objects.create(
            first_name="Dev", last_name="Rana", primary_contact="9800000001", location="Tulsipur",
            school=cls.school, role=StaffRole.objects.create(role="Teacher"),
        )

        cls.mark(cls.student, "2082-11-03", True)
        cls.mark(cls.student, "2083-01-02", True, checked_in_at=utc(3, 56))
        cls.mark(cls.student, "2083-01-03", False, reason="Fever")
        cls.mark(cls.student, "2083-06-12", False)
        # the same day marked twice: absent on paper, then a card punch
        cls.mark(cls.student, "2083-06-12", True, checked_in_at=utc(4, 5))
        cls.mark(cls.student, "2083-06-13", True, is_active=False)
        cls.mark(cls.outsider, "2083-01-02", False)

        StaffAttendance.objects.create(
            staff=cls.staff, school=cls.school, date="2083-06-14", status=True,
            checked_in_at=utc(3, 30), checked_out_at=utc(10, 45), reason="",
        )
        StaffAttendance.objects.create(
            staff=cls.staff, school=cls.school, date="2083-06-15", status=False, reason="Training",
        )

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
    def make_student(cls, klass, first):
        return Student.objects.create(
            first_name=first, last_name="Pun", birth_date="2070-01-01", gender=2,
            location="Tulsipur", class_info=klass, academic_year=klass.academic_year,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name=f"Father of {first}", mother_name="Mother Name", guardian_contact="9800000000",
            ),
        )

    @classmethod
    def mark(cls, student, date, status, **fields):
        roll = ClassAttendance.objects.create(
            date=date, class_info=student.class_info, school=student.class_info.school,
        )
        fields.setdefault("reason", "")
        return StudentAttendance.objects.create(class_attendance=roll, student=student, status=status, **fields)

    def history(self, **params):
        params.setdefault("school", self.school.id)
        with patch("main.views.AttendanceHistoryView.ndt_today", return_value="2083-06-24"):
            return AttendanceHistoryView().get(SimpleNamespace(query_params=params))

    def test_a_student_year(self):
        data = self.history(student=self.student.id).data
        self.assertEqual(data["year"], "2083")
        self.assertEqual(data["years"], ["2083", "2082"])
        self.assertEqual(data["today"], "2083-06-24")
        self.assertEqual(len(data["months"]), 12)
        self.assertEqual(data["days"], [
            {"date": "2083-01-02", "present": True, "in": 581, "out": None, "reason": ""},
            {"date": "2083-01-03", "present": False, "in": None, "out": None, "reason": "Fever"},
            # marked twice: the punch wins; the removed row of the 13th is not counted
            {"date": "2083-06-12", "present": True, "in": 590, "out": None, "reason": ""},
        ])

    def test_an_earlier_year_when_asked_for(self):
        data = self.history(student=self.student.id, year="2082").data
        self.assertEqual(data["year"], "2082")
        self.assertEqual([d["date"] for d in data["days"]], ["2082-11-03"])
        # a year with nothing in it falls back to the current one
        self.assertEqual(self.history(student=self.student.id, year="2079").data["year"], "2083")

    def test_a_staff_member(self):
        data = self.history(staff=self.staff.id).data
        self.assertEqual(data["years"], ["2083"])
        self.assertEqual(data["days"], [
            {"date": "2083-06-14", "present": True, "in": 555, "out": 990, "reason": ""},
            {"date": "2083-06-15", "present": False, "in": None, "out": None, "reason": "Training"},
        ])

    def test_nobody_marked_yet(self):
        data = self.history(student=self.quiet.id).data
        self.assertEqual((data["year"], data["years"], data["days"]), ("2083", [], []))
        self.assertEqual(len(data["months"]), 12)

    def test_another_schools_people_are_not_found(self):
        self.assertEqual(self.history(student=self.outsider.id).status_code, 404)
        self.assertEqual(self.history(school=self.other.id, student=self.student.id).status_code, 404)
        self.assertEqual(self.history(school=self.other.id, staff=self.staff.id).status_code, 404)
        self.assertEqual(self.history(school=self.other.id, student=self.outsider.id).status_code, 200)

    def test_a_request_must_name_a_school_and_one_person(self):
        for params in (
            {"school": ""}, {"school": "abc", "student": self.student.id},
            {"student": "abc"}, {}, {"student": self.student.id, "staff": self.staff.id},
        ):
            params.setdefault("school", self.school.id)
            self.assertEqual(self.history(**params).status_code, 400, params)
