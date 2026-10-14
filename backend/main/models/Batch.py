from django.db.models import ForeignKey, IntegerField, BooleanField, CASCADE

#
from .BaseModel import BaseModel, CustomCharField, _allow_empty


class Batch(BaseModel):
    """
    A cohort/intake for higher-education programs (bachelor/master/diploma/
    pre-diploma). The batch is a student's IMMUTABLE identity for life -- the
    semester they are in is just a counter that advances on promotion.

    Adding batch as a dimension of the class lets two intakes sit in the same
    course+semester at once (e.g. 2078 and 2079 both in BCA sem-1 during an
    overlap) without collapsing onto one ClassInfo row, which is what breaks
    per-cohort academic-year, fee and exam handling today.

    This model is purely ADDITIVE: nothing else references it until a class is
    explicitly stamped with a batch, so existing (school / un-batched) data is
    untouched.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    course = ForeignKey("main.Course", on_delete=CASCADE, **_allow_empty)
    # Admission year in Bikram Sambat, e.g. "2079" -- the cohort's stable name.
    year = CustomCharField(min_length=4, max_length=9)
    # The academic year the batch was admitted in (its origin stamp).
    start_academic_year = ForeignKey(
        "main.AcademicYear", on_delete=CASCADE, **_allow_empty
    )
    # Convenience pointer to where the cohort currently is; the authoritative
    # per-term rows are still the ClassInfo rows the batch has passed through.
    # A program is organised EITHER by semester (1..10) OR by year (1..4) --
    # diploma programs like Forestry/Pharmacy run year-wise -- so exactly one of
    # these carries the cohort's current term. Both nullable = additive.
    current_semester = IntegerField(**_allow_empty)
    current_year = IntegerField(**_allow_empty)
    # Set once the cohort finishes its final semester. Its historical rows stay
    # intact as immutable financial/exam history.
    graduated = BooleanField(default=False)

    class Meta:
        # One batch per (school, course, admission-year).
        unique_together = ("school", "course", "year")

    def __str__(self) -> str:
        course = self.course.course if self.course_id else "?"
        return f"Batch {self.year} - {course}"
