from django.core.cache import cache
from rest_framework.test import APIClient

from account.auth.context import users_context
from account.models import StaffAccount, StudentAccount
from main.models.FiscalYears import EconomicYear
from main.models.Guardian import Guardian, StudentGuardian
from main.models.Staff import Staff, StaffRole
from main.models.Student import Student, StudentGuardianInfo
from main.test_digital_id import DigitalIdTests

PASSWORD = "a long test passphrase"
DEVICE = {"platform": "android", "label": "Test phone", "app_version": "1.0.0"}


class MobileFixtures:
    """Two schools that use the app, with a student, a teacher and a parent."""

    @classmethod
    def build(cls, target):
        target.year = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        target.school = cls.school("one", target.year, "ONE001")
        target.other = cls.school("two", target.year, "TWO002")
        target.student = cls.student(target.school, "Asha", phone="9811111111", email="parent@example.com")
        target.sibling = cls.student(target.school, "Bina", phone="9811111111")
        target.student_account = StudentAccount.objects.create_user(username="asha-pun", password=PASSWORD)
        target.student.account = target.student_account
        target.student.save(update_fields=["account"])
        role = StaffRole.objects.create(role="Teacher")
        target.staff_account = StaffAccount.objects.create_user(username="teacher-one", password=PASSWORD)
        target.staff = Staff.objects.create(
            account=target.staff_account, school=target.school, role=role, first_name="Sita", last_name="Rai",
            primary_contact="9800000001", location="Test", permissions=[1501, 1503],
        )
        target.admin_account = target.school.account
        target.admin_account.set_password(PASSWORD)
        target.admin_account.save()
        target.guardian = Guardian.objects.create(
            school=target.school, phone="9811111111", email="parent@example.com", name="Hari Pun"
        )
        for child in (target.student, target.sibling):
            StudentGuardian.objects.create(
                student=child, guardian=target.guardian, relation=StudentGuardian.FATHER,
                state=StudentGuardian.LINKED, source=StudentGuardian.BY_SCHOOL, decided_at="2026-11-05T00:00:00Z",
                is_primary=True,
            )

    @staticmethod
    def school(tag, year, code):
        school = DigitalIdTests.school(tag, year)
        school.app_code = code
        school.uses_mobile_app = True
        school.save()
        return school

    @staticmethod
    def student(school, first_name, last_name="Pun", phone="9800000000", email=None):
        return Student.objects.create(
            first_name=first_name, last_name=last_name, birth_date="2070-01-01", gender=2, location="Dang",
            class_info=school.klass, academic_year=school.year,
            guardian_info=StudentGuardianInfo.objects.create(
                father_name="Hari Pun", mother_name="Gita Pun", guardian_contact=phone, guardian_email=email
            ),
        )


class MobileTestMixin:
    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.addCleanup(users_context.set, None)

    def api(self, token=None, **headers):
        client = APIClient(**headers)
        if token:
            client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        return client

    def post(self, path, body, token=None):
        return self.api(token).post(f"/api/mobile/v1/{path}", body, format="json")

    def get(self, path, token=None):
        return self.api(token).get(f"/api/mobile/v1/{path}")

    def sign_in(self, role="student", username="asha-pun", password=PASSWORD, code="ONE001"):
        return self.post("auth/signin", {
            "school_code": code, "role": role, "username": username, "password": password, "device": DEVICE,
        })

    def tokens(self, **kwargs):
        answer = self.sign_in(**kwargs)
        self.assertEqual(answer.status_code, 200, answer.content)
        return answer.json()["tokens"]

    def error(self, response):
        return response.json()["error"]["code"]


def session_token(role, account, school):
    """An access token for one account, without going through a sign-in."""
    from mobileapi.models import AppSession
    from mobileapi.tokens import start_session

    _, tokens = start_session(role=role, account=account, school=school, platform=AppSession.ANDROID,
                              device_label="Test phone", app_version="1.0.0")
    return tokens["access_token"]


class WriteMixin:
    """Signed-in writes carry an Idempotency-Key, as the app sends them."""

    key_counter = 0

    def write(self, method, path, body=None, token=None, key=None, fmt="json"):
        if key is None:
            WriteMixin.key_counter += 1
            key = f"test-key-{WriteMixin.key_counter:06d}"
        client = self.api(token, HTTP_IDEMPOTENCY_KEY=key) if key else self.api(token)
        return getattr(client, method)(f"/api/mobile/v1/{path}", body, format=fmt)
