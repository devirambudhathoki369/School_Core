from django.db.models import (
    IntegerField,
    DecimalField,
    BooleanField,
    ForeignKey,
    CASCADE,
    JSONField,
    Q,
    UniqueConstraint,
)

#
from customs.NepaliDateField import NepaliDateField

#
from ..BaseModel import BaseModel
from ...constants.marks_field import MARKS_FIELD_CONFIGS


class ClassResult(BaseModel):
    exam = ForeignKey("main.exam", on_delete=CASCADE)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    subject = ForeignKey("main.Subject", on_delete=CASCADE)
    criteria = JSONField(default=dict)
    published_date = NepaliDateField(null=True, blank=True)

    class Meta:
        constraints = [
            # A second active header for the same subject shows up as that
            # subject listed TWICE on the class ledger, with its marks split
            # across the two rows. Dropped headers keep `is_active=False` and
            # stay out of the way, so re-entry after a delete still works.
            UniqueConstraint(
                fields=("exam", "class_info", "subject"),
                condition=Q(is_active=True),
                name="uniq_active_class_result_per_subject",
            )
        ]


class StudentResult(BaseModel):
    student = ForeignKey("main.Student", on_delete=CASCADE)
    theory = DecimalField(**MARKS_FIELD_CONFIGS, null=True, blank=True)
    practical = DecimalField(**MARKS_FIELD_CONFIGS, null=True, blank=True)
    total = DecimalField(**MARKS_FIELD_CONFIGS)
    attendance = IntegerField(null=True, blank=True)
    inclusion = DecimalField(**MARKS_FIELD_CONFIGS, null=True, blank=True)
    result = BooleanField()  # True: Pass, False: Fail
    absent = BooleanField(
        default=False, null=True, blank=True
    )  # True: Absent, False: Present
    class_result = ForeignKey("main.ClassResult", on_delete=CASCADE)
    position_in_section = IntegerField(null=True, blank=True)
    position_in_class = IntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            # A student has one mark per subject per exam. Without this a
            # double-submit or a stale marks-entry tab wrote a second row and
            # every reader was left guessing which one counts.
            UniqueConstraint(
                fields=("class_result", "student"),
                condition=Q(is_active=True),
                name="uniq_active_student_result_per_student",
            )
        ]
