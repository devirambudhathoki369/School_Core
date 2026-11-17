from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.models import AdminAccount
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Section import Section
from main.models.Student import Student, StudentGuardianInfo

RUNNING, PASSED_OUT, DROPPED_OUT = 1, 2, 3


@override_settings(ENFORCE_SCHOOL_SCOPE=True)
class StudentListTests(TestCase):
    """GET /api/students/list: the Students page."""

    @classmethod
    def setUpTestData(cls):
        cls.ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.one, cls.one_year = cls.school("one")
        cls.two, cls.two_year = cls.school("two")
        a = Section.objects.create(school=cls.one, section="A")
        cls.six = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=2, grade=6, section=a)
        cls.four = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=2, grade=4, section=a)
        cls.nursery = ClassInfo.objects.create(school=cls.one, academic_year=cls.one_year, education_level=1, grade=1)
        cls.elsewhere = ClassInfo.objects.create(school=cls.two, academic_year=cls.two_year, education_level=2, grade=6)
        cls.ten = cls.student(cls.six, "Anisha", "Rana", "10", "9845100273", guardian="Gita Rana")
        cls.two_ = cls.student(cls.six, "Sujan", "Pun", "2", "9806600581")
        cls.rohan = cls.student(cls.four, "Rohan", "Magar", "7", "9811100906")
        cls.tiny = cls.student(cls.nursery, "Mina", "Oli", "1", "9857700021")
        cls.left = cls.student(cls.four, "Bibek", "Kc", "1", "9819900615", status=DROPPED_OUT)
        cls.done = cls.student(cls.six, "Puja", "Oli", "3", "9800000444", status=PASSED_OUT)
        cls.other_school = cls.student(cls.elsewhere, "Asha", "Rana", "1", "9845100999")

    @classmethod
    def school(cls, tag):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email=f"{tag}@example.com", account=AdminAccount.objects.create(username=f"list-{tag}"),
            economic_year=cls.ey,
        )
        return school, AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")

    @classmethod
    def student(cls, class_info, first, last, roll, phone, status=RUNNING, guardian=""):
        return Student.objects.create(
            first_name=first, last_name=last, birth_date="2070-01-01", gender=2, location="Dang",
            class_info=class_info, academic_year=class_info.academic_year, roll_no=roll, status=status,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name=f"Father {last}", mother_name="M", guardian_name=guardian, guardian_contact=phone),
        )

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.issue(self.one.account).key}")

    def get(self, **params):
        return self.client.get("/api/students/list", {"school": self.one.id, **params})

    def ids(self, response):
        self.assertEqual(response.status_code, 200, response.content)
        return [row["id"] for row in response.data["results"]]

    def test_running_students_of_the_school_in_class_order_then_by_roll(self):
        response = self.get()
        # nursery (montessory) first, then class 4, then class 6 with roll 2 before roll 10
        self.assertEqual(self.ids(response), [self.tiny.id, self.rohan.id, self.two_.id, self.ten.id])
        self.assertEqual(response.data["count"], 4)
        self.assertEqual(response.data["counts"], {"1": 4, "2": 1, "3": 1})

    def test_a_row_carries_what_the_page_shows(self):
        row = next(r for r in self.get().data["results"] if r["id"] == self.ten.id)
        self.assertEqual(row["name"], "Anisha Rana")
        self.assertEqual((row["roll_no"], row["status"], row["class_info"]), ("10", RUNNING, self.six.id))
        self.assertEqual(row["class_academic_year"], self.one_year.id)
        self.assertEqual((row["guardian"], row["guardian_contact"]), ("Gita Rana", "9845100273"))
        self.assertTrue(row["classname"])
        rohan = next(r for r in self.get().data["results"] if r["id"] == self.rohan.id)
        self.assertEqual(rohan["guardian"], "Father Magar")  # no guardian named: the father

    def test_status_tabs(self):
        self.assertEqual(self.ids(self.get(status=PASSED_OUT)), [self.done.id])
        self.assertEqual(self.ids(self.get(status=DROPPED_OUT)), [self.left.id])
        self.assertEqual(len(self.ids(self.get(status="all"))), 6)
        self.assertEqual(self.get(status="9").status_code, 400)

    def test_search_by_name_id_or_phone(self):
        self.assertEqual(self.ids(self.get(q="ani rana")), [self.ten.id])
        self.assertEqual(self.ids(self.get(q="oli", status="all")), [self.tiny.id, self.done.id])
        self.assertEqual(self.ids(self.get(q=str(self.rohan.id))), [self.rohan.id])
        self.assertEqual(self.ids(self.get(q="0581")), [self.two_.id])
        self.assertEqual(self.get(q="oli").data["counts"], {"1": 1, "2": 1})

    def test_a_class_filter_and_another_schools_class(self):
        self.assertEqual(self.ids(self.get(class_info=self.six.id)), [self.two_.id, self.ten.id])
        self.assertIn(self.get(class_info=self.elsewhere.id).status_code, (403, 404))
        self.assertEqual(self.get(class_info="x").status_code, 400)

    def test_another_schools_students_are_never_listed(self):
        self.assertNotIn(self.other_school.id, self.ids(self.get(status="all", q="rana")))
        refused = self.client.get("/api/students/list", {"school": self.two.id})
        self.assertIn(refused.status_code, (401, 403))

    def test_pages(self):
        first = self.get(page_size=3)
        self.assertEqual(len(self.ids(first)), 3)
        self.assertEqual(first.data["count"], 4)
        self.assertEqual(self.ids(self.get(page_size=3, page=2)), [self.ten.id])

    def test_the_school_is_required(self):
        self.assertEqual(self.client.get("/api/students/list").status_code, 400)
