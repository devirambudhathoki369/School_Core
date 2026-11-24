"""People's uploaded files get names nobody can guess (main/methods/uploads.py)."""
import io
import os
import tempfile

from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import TestCase, override_settings
from PIL import Image

from account.auth.context import users_context
from account.models import AdminAccount
from main.methods.uploads import UNGUESSABLE_NAME, shown_name, unguessable_name
from main.models.ClassInfo import ClassInfo
from main.models.FiscalYears import AcademicYear, EconomicYear
from main.models.SchoolAdmin import SchoolAdmin
from main.models.Student import Student, StudentGuardianInfo


def a_picture(name="IMG_0001.jpg"):
    out = io.BytesIO()
    Image.new("RGB", (4, 4)).save(out, "JPEG")
    return SimpleUploadedFile(name, out.getvalue(), content_type="image/jpeg")


class UnguessableNameTests(TestCase):
    def test_the_name_starts_with_16_random_characters_and_keeps_the_senders(self):
        first, second = (unguessable_name("student_profiles/%Y", "IMG_0001.jpg") for _ in range(2))
        self.assertRegex(first, r"^student_profiles/\d{4}/[A-Za-z0-9_-]{16}-IMG_0001\.jpg$")
        self.assertNotEqual(first, second)
        self.assertEqual(shown_name(first), "IMG_0001.jpg")

    def test_cutting_a_long_name_keeps_its_type(self):
        name = unguessable_name("x", "a" * 80 + ".pdf")
        self.assertTrue(name.endswith(".pdf"))
        self.assertEqual(len(os.path.basename(name)), 17 + 40)

    def test_a_trailing_dot_is_dropped_as_the_upload_checks_drop_it(self):
        # "x.html." passes no check as a pdf; "<long>.pdf." must not be cut into a new type
        name = unguessable_name("x", "b" * 34 + ".html.pdf.")
        self.assertTrue(name.endswith(".pdf"), name)
        self.assertNotIn(".html.", name[-6:])

    def test_a_path_in_the_name_is_ignored(self):
        self.assertRegex(unguessable_name("x", "../../etc/passwd"), r"^x/[A-Za-z0-9_-]{16}-passwd$")


class PhotoNameTests(TestCase):
    def setUp(self):
        self.addCleanup(users_context.set, None)
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        settings = override_settings(MEDIA_ROOT=self.media.name)
        settings.enable()
        self.addCleanup(settings.disable)
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

    def test_a_new_photo_gets_an_unguessable_name(self):
        self.student.image.save("12.jpg", a_picture("12.jpg"))
        self.assertRegex(self.student.image.name, r"^student_profiles/\d{4}/[A-Za-z0-9_-]{16}-12\.jpg$")

    def test_older_files_are_renamed_and_the_rows_follow(self):
        # a photo saved the old way, under the name it was sent with
        old = "student_profiles/2083/12.jpg"
        os.makedirs(os.path.join(self.media.name, "student_profiles/2083"))
        with open(os.path.join(self.media.name, old), "wb") as f:
            f.write(a_picture().read())
        Student.objects.filter(pk=self.student.pk).update(image=old)
        out = io.StringIO()
        call_command("randomize_media_names", stdout=out)
        self.assertIn("Student.image: Would rename 1.", out.getvalue())
        self.student.refresh_from_db()
        self.assertEqual(self.student.image.name, old)  # nothing moves without --apply

        call_command("randomize_media_names", "--apply", stdout=io.StringIO())
        self.student.refresh_from_db()
        new = self.student.image.name
        self.assertRegex(new, r"^student_profiles/2083/[A-Za-z0-9_-]{16}-12\.jpg$")
        self.assertTrue(os.path.exists(os.path.join(self.media.name, new)))
        self.assertFalse(os.path.exists(os.path.join(self.media.name, old)))
        # a second run finds nothing to do
        out = io.StringIO()
        call_command("randomize_media_names", "--apply", stdout=out)
        self.assertIn("Student.image: Renamed 0.", out.getvalue())

    def test_a_name_missing_from_disk_is_left_alone(self):
        Student.objects.filter(pk=self.student.pk).update(image="student_profiles/2083/gone.jpg")
        out = io.StringIO()
        call_command("randomize_media_names", "--apply", stdout=out)
        self.assertIn("Student.image: Renamed 0. Missing from disk: 1.", out.getvalue())
        self.student.refresh_from_db()
        self.assertEqual(self.student.image.name, "student_profiles/2083/gone.jpg")

    def test_the_pattern_matches_only_the_random_start(self):
        self.assertTrue(UNGUESSABLE_NAME.match("AbCdEfGhIjKlMnOp-12.jpg"))
        self.assertFalse(UNGUESSABLE_NAME.match("IMG_20261123_1015.jpg"))
