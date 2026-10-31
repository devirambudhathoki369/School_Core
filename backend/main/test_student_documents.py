import io
import os
import tempfile
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.signing import TimestampSigner
from django.test import TestCase, override_settings
from PIL import Image
from rest_framework.test import APIClient

from account.auth.AuthToken import AdminAuthToken
from account.auth.context import users_context
from account.models import AdminAccount
from main.methods.uploads import PrivateDocumentStorage
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo


def a_picture():
    out = io.BytesIO()
    Image.new("RGB", (4, 4)).save(out, "JPEG")
    return SimpleUploadedFile("birth.jpg", out.getvalue(), content_type="image/jpeg")


class StudentDocumentTests(TestCase):
    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.public = tempfile.TemporaryDirectory()
        self.private = tempfile.TemporaryDirectory()
        self.addCleanup(self.public.cleanup)
        self.addCleanup(self.private.cleanup)
        settings = override_settings(MEDIA_ROOT=self.public.name, PRIVATE_MEDIA_ROOT=self.private.name)
        settings.enable()
        self.addCleanup(settings.disable)
        field = Student._meta.get_field("birth_certificate")
        patcher = patch.object(field, "storage", PrivateDocumentStorage())
        patcher.start()
        self.addCleanup(patcher.stop)
        ey = EconomicYear.objects.create(name="2083/84", start_date="2083-04-01", end_date="2084-03-30")
        self.school = SchoolAdmin.objects.create(
            name="School", address="Test address", estd_date="2080-01-01", renew_date="2084-01-01", pan_no="123",
            email="one@example.com", account=AdminAccount.objects.create(username="admin-one"), economic_year=ey,
        )
        year = AcademicYear.objects.create(school=self.school, name="2083", start_date="2083-01-01", end_date="2083-12-30")
        klass = ClassInfo.objects.create(school=self.school, academic_year=year, education_level=2, grade=4)
        self.student = Student.objects.create(
            first_name="Asha", last_name="Pun", birth_date="2070-01-01", gender=2, location="Dang",
            class_info=klass, academic_year=year,
            guardian_info=StudentGuardianInfo.objects.create(father_name="F", mother_name="M", guardian_contact="9800000000"),
        )

    def upload(self):
        self.student.birth_certificate.save("birth.jpg", a_picture())
        return self.student.birth_certificate.name

    def test_a_document_is_kept_outside_public_media(self):
        name = self.upload()
        self.assertTrue(os.path.exists(os.path.join(self.private.name, name)))
        self.assertFalse(os.path.exists(os.path.join(self.public.name, name)))

    def test_the_student_record_hands_out_a_signed_link_that_opens_it(self):
        self.upload()
        admin = APIClient()
        admin.credentials(HTTP_AUTHORIZATION=f"IGNITE {AdminAuthToken.objects.create(user=self.school.account).key}")
        record = admin.get("/api/students", {"school": self.school.id, "student": self.student.id}).json()
        link = record["birth_certificate"]
        self.assertIn("/api/documents/", link)
        self.assertNotIn("student_documents", link)
        answer = APIClient().get(link)
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(answer["Content-Type"], "image/jpeg")
        self.assertEqual(answer["Cache-Control"], "private, no-store")
        answer.close()

    def test_a_forged_link_opens_nothing(self):
        name = self.upload()
        forged = TimestampSigner(salt="not.the.right.salt").sign(name)
        self.assertEqual(APIClient().get(f"/api/documents/{forged}").status_code, 404)
        self.assertEqual(APIClient().get("/api/documents/student_documents").status_code, 404)

    def test_an_old_link_stops_working(self):
        self.upload()
        link = self.student.birth_certificate.url
        with override_settings(DOCUMENT_LINK_SECONDS=-1):
            self.assertEqual(APIClient().get(link).status_code, 404)

    def test_a_file_not_yet_moved_can_still_be_read_and_the_command_moves_it(self):
        name = "student_documents/2083/old.jpg"
        os.makedirs(os.path.join(self.public.name, "student_documents/2083"))
        with open(os.path.join(self.public.name, name), "wb") as out:
            out.write(a_picture().read())
        Student.objects.filter(pk=self.student.pk).update(birth_certificate=name)
        self.student.refresh_from_db()
        with self.student.birth_certificate.open("rb") as stored:
            self.assertTrue(stored.read())

        call_command("move_student_documents", stdout=io.StringIO())
        self.assertTrue(os.path.exists(os.path.join(self.public.name, name)), "no --apply, nothing moves")
        call_command("move_student_documents", "--apply", stdout=io.StringIO())
        self.assertFalse(os.path.exists(os.path.join(self.public.name, name)))
        self.assertTrue(os.path.exists(os.path.join(self.private.name, name)))
        call_command("move_student_documents", "--apply", stdout=io.StringIO())
