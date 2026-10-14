from django.db.models import (
    BooleanField,
    ForeignKey,
    JSONField,
    DecimalField,
    IntegerField,
    CASCADE,
)

#
from customs.NepaliDateField import NepaliDateField

#
from .BaseModel import BaseModel, CustomCharField
from ..methods.nepaliDatetime import ndt_today


#
class BaseLedger(BaseModel):
    date = NepaliDateField(default=ndt_today)
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    remarks = CustomCharField(min_length=1, max_length=50, null=True, blank=True)

    class Meta:
        abstract = True


class LedgerPosting(BaseLedger):
    months = JSONField(default=list)
    class_info = ForeignKey("main.ClassInfo", on_delete=CASCADE)
    # True when this posting was made for ONE student from their profile's
    # Ledger tab, rather than for the whole class from Payment > Ledger posting.
    # Both write a LedgerPosting against the class, so without this flag a class
    # accumulated one extra "posting group" per catch-up entry — a class could
    # end up offering "Ashad" twice (once class-wide, once from somebody's
    # profile) and re-offering months the class had already been billed for.
    single_student = BooleanField(default=False)


class StudentLedger(BaseLedger):
    student = ForeignKey("main.Student", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    details = JSONField(
        default=dict
    )  # expects {title__id: total_including_discount, ...}
    ledger_posting = ForeignKey("main.LedgerPosting", on_delete=CASCADE)
    total = DecimalField(max_digits=10, decimal_places=2)
    # Free-form per-posting metadata kept OUTSIDE `details`/`total`, so it never
    # enters dues/revenue reconciliation (mirrors StudentInvoice.extra_info).
    extra_info = JSONField(default=dict)


"""
We'll first create LedgerPosting then bulk create StudentLedger with LedgerPosting.id;
"""


class StaffLedger(BaseLedger):
    staff = ForeignKey("main.Staff", on_delete=CASCADE)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    months = JSONField(default=list)
    details = JSONField(default=dict)
    total = DecimalField(max_digits=10, decimal_places=2)
    # True when posted for ONE staff member from their profile's Ledger tab
    # (a missed title, a late joiner, a one-off bonus) rather than for everyone
    # from Payment > Salary posting. Salary posting blocks months that were
    # already posted, so without this flag one catch-up entry would lock that
    # month for the whole staff. Mirrors LedgerPosting.single_student.
    single_staff = BooleanField(default=False)
