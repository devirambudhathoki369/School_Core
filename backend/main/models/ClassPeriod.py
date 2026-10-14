from django.db.models import IntegerField, JSONField, ForeignKey, CASCADE

#
from .BaseModel import BaseModel, _allow_empty


class ClassPeriod(BaseModel):
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    period_count = IntegerField()
    subjects = JSONField(default=dict)  # {period_index: subject_id, ...}
    teachers = JSONField(default=dict)  # {period_index: teacher_id, ...}
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE, **_allow_empty)
