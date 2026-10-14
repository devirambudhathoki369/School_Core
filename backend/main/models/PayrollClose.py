from django.db.models import (
    ForeignKey,
    IntegerField,
    DecimalField,
    JSONField,
    UniqueConstraint,
    Q,
    CASCADE,
    PROTECT,
    SET_NULL,
)

#
from customs.NepaliDateField import NepaliDateField
from .BaseModel import BaseModel


class StaffPayrollClose(BaseModel):
    """One school's payroll for one economic year, closed.

    Payroll is kept by economic year: a member of staff's balance is what was
    posted to them in the year less what they were paid in it. Nothing used to
    end that year. The economic year simply changed under every school at
    once, the payment screen started again from zero, and whatever a school
    still owed its staff stayed behind in a year no screen looks at.

    Closing the year does two things, and this row is the record of both:

    * the balance each member of staff is left with is MOVED into the next
      year -- a `cfo` line here, an `ob` line there (constants/payroll.py), so
      the two years together still add up to what they did before;
    * the year stops taking postings, payments and deletions, because any of
      those would change a balance that has already been carried.

    A row with `is_active=False` is a close that was undone.
    """

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    economic_year = ForeignKey(
        "main.EconomicYear", on_delete=PROTECT, related_name="payroll_closes"
    )
    # the year the balances were carried into
    next_economic_year = ForeignKey(
        "main.EconomicYear", on_delete=PROTECT, related_name="payroll_openings"
    )
    # The accounting year whose close closed this payroll year. Empty when the
    # payroll year was closed on its own (a school that keeps no books here).
    accounting_economic_year = ForeignKey(
        "accounting.AccountingEconomicYear",
        on_delete=SET_NULL,
        null=True,
        blank=True,
        related_name="payroll_closes",
    )
    # The dates the two lines carry. The salary sheet reads them to tell a
    # range that only sees the balance arrive from one that also holds the
    # year it came from, where counting it again would double it.
    carried_out_on = NepaliDateField()
    carried_in_on = NepaliDateField()
    staff_count = IntegerField(default=0)
    total_carried = DecimalField(max_digits=14, decimal_places=2, default=0)
    # {staff id: {title: amount}} as it stood at the close. The carried line is
    # one figure per person; this keeps what it was made of.
    breakdown = JSONField(default=dict)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=["school", "economic_year"],
                condition=Q(is_active=True),
                name="one_payroll_close_per_school_year",
            )
        ]

    def __str__(self) -> str:
        return f"Payroll close : school {self.school_id}, year {self.economic_year_id}"
