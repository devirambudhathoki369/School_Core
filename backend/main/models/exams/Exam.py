from django.db.models import ForeignKey, DecimalField, BooleanField, CASCADE

#
from ..BaseModel import BaseModel, CustomCharField
from ...constants.marks_field import MARKS_FIELD_CONFIGS


class Exam(BaseModel):
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    name = CustomCharField(min_length=4, max_length=40)
    inclusion = DecimalField(**MARKS_FIELD_CONFIGS, null=True, blank=True)
    attendance_inclusion = BooleanField(default=False)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
