from django.db.models import (
    Model,
    TextField,
    IntegerField,
    FileField,
    ForeignKey,
    CASCADE,
)


#
from .BaseModel import BaseModel, CustomCharField, _allow_empty
from ..methods.nepaliDatetime import ndt_today
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


class HomeworkSubmissionFile(Model):
    homework_submission = ForeignKey("main.HomeworkSubmission", on_delete=CASCADE)
    file = FileField(upload_to="homework_submission_files/%Y/%m/")
