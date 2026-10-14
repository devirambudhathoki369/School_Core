from django.db.models import BooleanField, ForeignKey, CASCADE

#
from customs.NepaliDateField import NepaliDateField

#
from .BaseModel import BaseModel, CustomCharField, _allow_empty


class FiscalYear(BaseModel):
    name = CustomCharField(min_length=4, max_length=20)
    start_date = NepaliDateField()
    end_date = NepaliDateField()
    closed = BooleanField(default=False)
    remarks = CustomCharField(min_length=1, max_length=50, **_allow_empty)

    class Meta:
        abstract = True


class EconomicYear(FiscalYear):
    pass


class AcademicYear(FiscalYear):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    pass


class AcademicYearMapping(BaseModel):
    # faculty-wise-academic-year-auto-switch
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    key = CustomCharField(min_length=1, max_length=10)
    academic_year = ForeignKey(
        "main.AcademicYear", on_delete=CASCADE, related_name="running_academic_year"
    )
    previous_academic_year = ForeignKey(
        "main.AcademicYear",
        on_delete=CASCADE,
        related_name="previous_academic_year",
        **_allow_empty,
    )
