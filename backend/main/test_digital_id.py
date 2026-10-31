from django.test import TestCase
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken, StudentAuthToken
from account.models import AdminAccount, StudentAccount
from main.methods.digitalId import digital_id_code
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo
from account.auth.context import users_context


class DigitalIdTests(TestCase):
    def setUp(self):
        # A request leaves its account in the context for the next request to clear.
        self.addCleanup(users_context.set, None)

    PRIVATE = ("birth_date", "guardian_name", "guardian_contact", "guardian_address", "blood_group", "image")

    @classmethod
    def setUpTestData(cls):
        ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        cls.one = cls.school("one", ey)
        cls.two = cls.school("two", ey)
        cls.account = StudentAccount.objects.create(username="asha-pun")
        cls.asha = cls.student(cls.one, "Asha", cls.account)
        cls.bina = cls.student(cls.one, "Bina")
        cls.other = cls.student(cls.two, "Chandra")

    @classmethod
    def school(cls, tag, ey):
        school = SchoolAdmin.objects.create(
            name=f"School {tag}", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01",
            pan_no="123", email=f"{tag}@example.com", account=AdminAccount.objects.create(username=f"admin-{tag}"),
            economic_year=ey,
        )
        school.year = AcademicYear.objects.create(school=school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        school.klass = ClassInfo.objects.create(school=school, academic_year=school.year, education_level=2, grade=4)
        return school

    @classmethod
    def student(cls, school, first_name, account=None):
        return Student.objects.create(
            first_name=first_name, last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=school.klass, academic_year=school.year, account=account,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )

    def profile(self, **extra):
        return APIClient().get("/api/public_profile", {"org": self.one.id, "user": self.asha.id, "role": 1, **extra}).json()

    def test_a_link_without_its_code_says_who_and_not_how_to_reach(self):
        user = self.profile()["user"]
        self.assertEqual(user["name"].split()[0], "Asha")
        self.assertIn("classname", user)
        for key in self.PRIVATE:
            self.assertNotIn(key, user)

    def test_a_wrong_code_counts_as_no_code(self):
        user = self.profile(c="0" * 32)["user"]
        self.assertNotIn("guardian_contact", user)

    def test_the_code_on_a_card_opens_the_card(self):
        user = self.profile(c=digital_id_code(1, self.one.id, self.asha.id))["user"]
        self.assertEqual(user["guardian_contact"], "9800000000")
        self.assertEqual(user["birth_date"], "2070-01-01")

    def test_a_code_opens_only_its_own_person(self):
        code = digital_id_code(1, self.one.id, self.bina.id)
        self.assertNotIn("guardian_contact", self.profile(c=code)["user"])

    def signed_in(self, token_model, account):
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"IGNITE {token_model.objects.create(user=account).key}")
        return client

    def test_the_school_gets_codes_for_its_own_people_only(self):
        admin = self.signed_in(AdminAuthToken, self.one.account)
        ids = f"{self.asha.id},{self.bina.id},{self.other.id}"
        codes = admin.get("/api/digital_id_codes", {"school": self.one.id, "role": 1, "ids": ids}).json()
        self.assertEqual(set(codes), {str(self.asha.id), str(self.bina.id)})
        self.assertEqual(codes[str(self.asha.id)], digital_id_code(1, self.one.id, self.asha.id))

    def test_another_school_cannot_ask_for_codes(self):
        admin = self.signed_in(AdminAuthToken, self.two.account)
        answer = admin.get("/api/digital_id_codes", {"school": self.one.id, "role": 1, "ids": str(self.asha.id)})
        self.assertIn(answer.status_code, (401, 403))

    def test_a_student_gets_only_their_own_code(self):
        student = self.signed_in(StudentAuthToken, self.account)
        ids = f"{self.asha.id},{self.bina.id}"
        codes = student.get("/api/digital_id_codes", {"school": self.one.id, "role": 1, "ids": ids}).json()
        self.assertEqual(set(codes), {str(self.asha.id)})
        self.assertEqual(student.get("/api/digital_id_codes", {"school": self.one.id, "role": 2, "ids": ids}).json(), {})

    def test_no_sign_in_no_codes(self):
        answer = APIClient().get("/api/digital_id_codes", {"school": self.one.id, "role": 1, "ids": str(self.asha.id)})
        self.assertIn(answer.status_code, (401, 403))
