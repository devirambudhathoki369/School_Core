from django.test import TestCase

from account.models import AdminAccount
from main.management.commands.tenant_audit import audit
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo


class TenantAuditTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.fy = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-31")
        cls.one, cls.one_year = cls.school("one")
        cls.two, cls.two_year = cls.school("two")
        cls.one_class = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=2, grade=5)

    @classmethod
    def school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01",
            renew_date="2084-01-01", pan_no="123", email=f"{tag}@example.com",
            account=AdminAccount.objects.create(username=f"admin-{tag}"), economic_year=cls.fy,
        )
        return school, AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")

    def student(self, year):
        return Student.objects.create(
            first_name="Asha", last_name="Pun", birth_date="2070-01-01", gender=2, location="Tulsipur",
            class_info=self.one_class, academic_year=year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )

    def test_a_consistent_school_reports_nothing(self):
        self.student(self.one_year)
        self.assertEqual([r for r in audit() if r["model"] == "main.Student"], [])

    def test_a_student_whose_class_and_year_belong_to_two_schools_is_found(self):
        crossed = self.student(self.two_year)
        found = [r for r in audit(samples=5) if r["model"] == "main.Student"]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["rows"], 1)
        self.assertEqual(found[0]["ids"], [crossed.pk])
        self.assertEqual({found[0]["route"].split("__")[0], found[0]["other"].split("__")[0]}, {"class_info", "academic_year"})
