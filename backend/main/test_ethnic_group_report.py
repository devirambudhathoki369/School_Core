from collections import Counter
from types import SimpleNamespace

from django.test import TestCase

from account.models import AdminAccount
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo, StudentOtherInfo
from main.views.school.ClasswiseStudentStatisticsView import ClasswiseStudentStatisticsView
from main.views.school.EthnicGroupReportView import EthnicGroupReportView

NO_INFO = object()  # a student nobody has opened the "other information" tab for


class EthnicGroupReportTests(TestCase):
    """The report lists the students the classwise count counts, each with the
    ethnic group that was recorded for them, or none."""

    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.school, cls.year = cls.make_school("one")
        cls.other, cls.other_year = cls.make_school("two")
        cls.five = ClassInfo.objects.create(school=cls.school, academic_year=cls.year, education_level=2, grade=5)
        cls.six = ClassInfo.objects.create(school=cls.school, academic_year=cls.year, education_level=2, grade=6)
        cls.removed_class = ClassInfo.objects.create(
            school=cls.school, academic_year=cls.year, education_level=2, grade=7, is_active=False,
        )
        cls.other_class = ClassInfo.objects.create(
            school=cls.other, academic_year=cls.other_year, education_level=2, grade=5,
        )

        cls.magar = cls.make_student(cls.five, "Asha", "Pun", ethnicity=3, roll_no="2", middle_name="Kumari")
        cls.tharu = cls.make_student(cls.five, "Bikram", "Chaudhary", ethnicity=4, gender=1)
        cls.others = cls.make_student(cls.five, "Chandra", "Lama", ethnicity=0)
        cls.blank = cls.make_student(cls.five, "Dipa", "Oli", ethnicity=None)
        cls.no_info = cls.make_student(cls.six, "Esha", "Rai", ethnicity=NO_INFO)
        # none of these four belongs on the report
        cls.make_student(cls.six, "Passed", "Out", ethnicity=3, status=2)
        cls.make_student(cls.six, "Dropped", "Out", ethnicity=3, status=3)
        cls.make_student(cls.six, "Deleted", "Student", ethnicity=3, is_active=False)
        cls.make_student(cls.removed_class, "Removed", "Class", ethnicity=3)
        cls.make_student(cls.other_class, "Other", "School", ethnicity=3)

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
    def make_student(cls, klass, first, last, ethnicity, gender=2, **fields):
        other_info = None if ethnicity is NO_INFO else StudentOtherInfo.objects.create(ethnicity=ethnicity)
        return Student.objects.create(
            first_name=first, last_name=last, birth_date="2070-01-01", gender=gender,
            location="Tulsipur", class_info=klass, academic_year=klass.academic_year,
            other_info=other_info,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name=f"Father of {first}", mother_name="Mother Name", guardian_contact="9800000000",
            ),
            **fields,
        )

    def report(self, school=None, **params):
        params = {"school": self.school.id if school is None else school, **params}
        return EthnicGroupReportView().get(SimpleNamespace(query_params=params))

    def students(self, **kwargs):
        return {row["id"]: row for row in self.report(**kwargs).data["students"]}

    def test_only_the_running_students_of_this_school(self):
        self.assertEqual(
            set(self.students()),
            {self.magar.id, self.tharu.id, self.others.id, self.blank.id, self.no_info.id},
        )
        self.assertEqual([row["name"] for row in self.report(school=self.other.id).data["students"]], ["Other School"])

    def test_the_group_recorded_for_each_student(self):
        rows = self.students()
        self.assertEqual(rows[self.magar.id]["ethnicity"], 3)
        self.assertEqual(rows[self.tharu.id]["ethnicity"], 4)
        # "Others" is an answer the form offers; it is not the same as no answer
        self.assertEqual(rows[self.others.id]["ethnicity"], 0)
        self.assertIsNone(rows[self.blank.id]["ethnicity"])
        self.assertIsNone(rows[self.no_info.id]["ethnicity"])

    def test_a_row_carries_what_the_list_prints(self):
        row = self.students()[self.magar.id]
        self.assertEqual(row, {
            "id": self.magar.id, "name": "Asha Kumari Pun", "class_info": self.five.id, "roll_no": "2",
            "gender": 2, "ethnicity": 3, "father_name": "Father of Asha",
            "guardian_contact": "9800000000", "location": "Tulsipur",
        })
        # no middle name leaves no gap
        self.assertEqual(self.students()[self.tharu.id]["name"], "Bikram Chaudhary")

    def test_each_class_adds_up_to_the_classwise_count(self):
        counted = ClasswiseStudentStatisticsView().get(SimpleNamespace(query_params={"school": self.school.id})).data
        listed = Counter(row["class_info"] for row in self.report().data["students"])
        self.assertEqual(dict(listed), {klass: stats["total_count"] for klass, stats in counted.items()})
        self.assertEqual(dict(listed), {self.five.id: 4, self.six.id: 1})

    def test_a_request_that_names_no_school_is_refused(self):
        for school in ("", "abc"):
            self.assertEqual(self.report(school=school).status_code, 400)
        self.assertEqual(EthnicGroupReportView().get(SimpleNamespace(query_params={})).status_code, 400)
