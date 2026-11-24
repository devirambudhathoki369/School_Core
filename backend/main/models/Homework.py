from django.db.models import (
    Model,
    TextField,
    IntegerField,
    FileField,
    ForeignKey,
    CASCADE,
    CharField,
    CheckConstraint,
    DateTimeField,
    F,
    Index,
    Q,
)
from django.utils import timezone


#
from .BaseModel import BaseModel, CustomCharField, _allow_empty
from ..methods.nepaliDatetime import ndt_today
from ..methods.uploads import unguessable_name
from customs.NepaliDateField import NepaliDateField

HW_SUBMISSION_STATUS_CHOICES = [(1, "Received"), (2, "Checked")]


class Homework(BaseModel):
    title = CustomCharField(min_length=5, max_length=200)
    description = TextField()
    due_date = NepaliDateField()
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    subject = ForeignKey("main.Subject", on_delete=CASCADE)
    staff = ForeignKey("main.Staff", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)


class HomeworkSubmission(BaseModel):
    homework = ForeignKey("main.Homework", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE)
    submitted_date = NepaliDateField(default=ndt_today)
    status = IntegerField(choices=HW_SUBMISSION_STATUS_CHOICES, default=1)
    remarks = TextField(**_allow_empty)


class HomeworkFile(Model):
    homework = ForeignKey("main.Homework", on_delete=CASCADE)
    file = FileField(upload_to="homework_files/%Y/%m/")


def hand_in_file_path(instance, filename):
    """Where a handed-in file is saved: under a name nobody can guess, since
    media is served to anyone with the link and these are students' own pages
    and photos (main/methods/uploads.py `unguessable_name`). Migration 0119
    names this function, so it stays here."""
    return unguessable_name("homework_submission_files/%Y/%m", filename)


class HomeworkSubmissionFile(Model):
    homework_submission = ForeignKey("main.HomeworkSubmission", on_delete=CASCADE)
    file = FileField(upload_to=hand_in_file_path)


class HomeworkMessage(Model):
    """A short message about one homework, between one student and the
    teacher who set it, in the app (mobile/SPEC.md §4). A thread is
    (homework, student): homework 1 — 0..* message 0..* — 1 student.

    `staff` is the teacher who wrote it; empty when the student wrote it.
    `read_at` is when the other side first opened it. A trigger (migration
    0122) keeps the student in the homework's school and the writing teacher
    the homework's own.
    """

    MAX_LENGTH = 500

    # the thread index below starts with the homework, so it serves this key too
    homework = ForeignKey("main.Homework", on_delete=CASCADE, db_index=False, related_name="messages")
    student = ForeignKey("main.Student", on_delete=CASCADE, related_name="homework_messages")
    staff = ForeignKey("main.Staff", on_delete=CASCADE, null=True, blank=True, related_name="homework_messages")
    body = CharField(max_length=MAX_LENGTH)
    created_at = DateTimeField(default=timezone.now)
    read_at = DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "main_homeworkmessage"
        indexes = [Index(fields=["homework", "student", "id"], name="main_hwmessage_thread")]
        constraints = [
            CheckConstraint(condition=Q(body__regex=r"\S"), name="main_hwmessage_body_not_blank"),
            CheckConstraint(
                condition=Q(read_at__isnull=True) | Q(read_at__gte=F("created_at")),
                name="main_hwmessage_read_after_sent",
            ),
        ]

    @property
    def by_teacher(self) -> bool:
        return self.staff_id is not None
