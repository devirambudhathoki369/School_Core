from django.db.models import IntegerField, ForeignKey, CASCADE

#
from .BaseModel import BaseModel, CustomCharField, _allow_empty
from ..choices.Education import EDUCATION_LEVEL_CHOICES, FACULTY_CHOICES


class Course(BaseModel):
    course = CustomCharField(min_length=2, max_length=50)
    education_level = IntegerField(choices=EDUCATION_LEVEL_CHOICES)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    # Program length: how many years OR semesters this program runs. A program is
    # organised EITHER year-wise (diploma: Forestry/Pharmacy) OR semester-wise
    # (engineering), so exactly one of these is set. Nullable + additive: existing
    # courses are untouched and callers fall back to the "highest running level"
    # heuristic when a length is unknown. Lets the close/guard tell a genuinely
    # TERMINAL (graduating) level from a junior one even when the next level has
    # not been created/enrolled yet.
    total_years = IntegerField(**_allow_empty)
    total_semesters = IntegerField(**_allow_empty)
    # A +2 stream (education_level 3) belongs to ONE faculty: Management ▸
    # Computer Science is not Education ▸ Computer Science. Without it every
    # faculty's class picker offered every stream. College courses leave it
    # empty — they have no faculty.
    faculty = IntegerField(choices=FACULTY_CHOICES, **_allow_empty)

    def __str__(self) -> str:
        return f"{self.school.name} > Course : {self.course}"
