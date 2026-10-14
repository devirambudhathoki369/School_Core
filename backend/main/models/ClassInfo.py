from django.db.models import Model, IntegerField, ForeignKey, CASCADE

#
from ..choices.Education import (
    EDUCATION_LEVEL_CHOICES,
    GRADE_CHOICES,
    FACULTY_CHOICES,
    YEAR_CHOICES,
    SEMESTER_CHOICES,
)
from ..views.fields import CLASS_DETAILS_FIELDS
from .BaseModel import BaseModel, CustomCharField, _allow_empty


class ClassDetails(Model):
    education_level = IntegerField(choices=EDUCATION_LEVEL_CHOICES)
    grade = IntegerField(choices=GRADE_CHOICES, null=True, blank=True)
    faculty = IntegerField(choices=FACULTY_CHOICES, null=True, blank=True)
    course = ForeignKey("main.Course", on_delete=CASCADE, null=True, blank=True)
    section = ForeignKey("main.Section", on_delete=CASCADE, null=True, blank=True)
    year = IntegerField(choices=YEAR_CHOICES, null=True, blank=True)
    semester = IntegerField(choices=SEMESTER_CHOICES, null=True, blank=True)
    name = CustomCharField(min_length=1, max_length=100, **_allow_empty)

    class Meta:
        abstract = True


class ClassInfo(BaseModel, ClassDetails):
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE, **_allow_empty)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="school")
    # Cohort/intake this class-row belongs to. NULL for every existing row and
    # for school (grade) classes -- only higher-ed rows get stamped. Kept OUT of
    # CLASS_DETAILS_FIELDS on purpose so fee resolution (feeq, which filters by
    # class details) stays batch-agnostic and billing amounts are unchanged.
    batch = ForeignKey("main.Batch", on_delete=CASCADE, **_allow_empty)

    class Meta:
        # batch is added to the uniqueness so the SAME course+semester can exist
        # once per batch. Postgres treats NULLs as distinct, so all existing
        # (batch=NULL) rows remain unique exactly as before.
        unique_together = (*CLASS_DETAILS_FIELDS, "batch")
