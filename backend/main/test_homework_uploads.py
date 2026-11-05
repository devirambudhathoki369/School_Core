from django.core.files.uploadedfile import SimpleUploadedFile
from django.http import QueryDict
from django.test import SimpleTestCase
from rest_framework import serializers

from main.serializers.HomeworkSerializer import UploadList


class Form(serializers.Serializer):
    files = UploadList(max_length=10, required=False, default=list)


class HandIn(serializers.Serializer):
    files = UploadList(max_length=10, allow_empty=False)


class UploadListTests(SimpleTestCase):
    def test_a_homework_with_no_attachment_still_saves(self):
        # The app sends an empty `files=` when the teacher attaches nothing.
        form = Form(data=QueryDict("files=&title=x"))
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual(form.validated_data["files"], [])

    def test_text_posing_as_a_file_is_refused(self):
        form = Form(data={"files": ["/etc/passwd"]})
        self.assertFalse(form.is_valid())

    def test_real_uploads_pass_through(self):
        upload = SimpleUploadedFile("work.pdf", b"%PDF-1.4", content_type="application/pdf")
        form = Form(data={"files": ["", upload]})
        self.assertTrue(form.is_valid(), form.errors)
        self.assertEqual([f.name for f in form.validated_data["files"]], ["work.pdf"])

    def test_more_than_ten_files_are_refused(self):
        uploads = [SimpleUploadedFile(f"{n}.pdf", b"%PDF") for n in range(11)]
        self.assertFalse(Form(data={"files": uploads}).is_valid())

    def test_a_submission_must_carry_a_file(self):
        self.assertFalse(HandIn(data=QueryDict("files=")).is_valid())
