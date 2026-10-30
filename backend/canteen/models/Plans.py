"""How students use the canteen, and the monthly posting that comes of it.

    CanteenPlan          a use type the school defines: "Day care" (monthly),
                         "Tiffin monthly" (monthly), "Tiffin cash or due" (per use)
      CanteenEnrollment    one student on one use type — a REGULAR USER
    CanteenPosting       one run of Monthly Posting: these months, these types
      CanteenPlanCharge    one month of one enrolment, as posted

ALL OF IT IS THE CANTEEN'S OWN BILLING. A monthly use type names an ITEM (the
title on the canteen bill — "Tiffin", "Day care"), and Monthly Posting charges
each regular user that item at their CLASS's rate (CanteenClassRate) for every
month picked, onto their canteen account — the way the fee ledger posting does
for fees, but in the canteen's ledger, receipts and dues. Nothing here touches
the school's fee bills.

A PER-USE ("cash or due") type is paid when taken: cash at the counter, or due
on the student's canteen account up to the type's due limit, collected later at
Canteen > Collect & Receipt.
"""

from django.db.models import (
    CASCADE,
    SET_NULL,
    BooleanField,
    DecimalField,
    ForeignKey,
    IntegerField,
    JSONField,
    Q,
    UniqueConstraint,
)

from customs.NepaliDateField import NepaliDateField
from main.methods.nepaliDatetime import ndt_today
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty

from ..constants import PLAN_KIND_CHOICES, PLAN_MONTHLY

MONEY = {"max_digits": 10, "decimal_places": 2}


class CanteenPlan(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_plans")
    name = CustomCharField(min_length=2, max_length=60)
    kind = IntegerField(choices=PLAN_KIND_CHOICES, default=PLAN_MONTHLY)
    # MONTHLY only: the item it posts every month (its title on the canteen
    # bill), charged at the student's class rate for that item.
    item = ForeignKey("canteen.CanteenItem", on_delete=SET_NULL, related_name="plans", **_allow_empty)
    # MONTHLY only: meals at the counter are covered by it, so the counter
    # serves them without charging (and counts them).
    counter_meals = BooleanField(default=True)
    # PER-USE only: how far below zero the student's canteen account may go
    # for it. 0 = cash only.
    due_limit = DecimalField(**MONEY, default=0)
    order = IntegerField(default=0)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("school", "name"),
                condition=Q(is_active=True),
                name="uniq_active_canteen_plan_per_school",
            )
        ]

    def __str__(self):
        return f"{self.school_id} > {self.name}"


class CanteenEnrollment(BaseModel):
    """A regular user. Stopping writes `ended_on` and keeps the row: the months
    already posted point at it."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_enrollments")
    plan = ForeignKey("canteen.CanteenPlan", on_delete=CASCADE, related_name="enrollments")
    student = ForeignKey("main.Student", on_delete=CASCADE, related_name="canteen_enrollments")
    # Blank = the class rate. A figure = this student's own rate (a concession).
    rate = DecimalField(**MONEY, **_allow_empty)
    # From this date (BS) — the first month posted is this date's month.
    start_date = NepaliDateField(default=ndt_today)
    # The last day on it (BS); that date's month is the last month posted.
    ended_on = NepaliDateField(**_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("plan", "student"),
                condition=Q(is_active=True, ended_on__isnull=True),
                name="uniq_open_canteen_enrollment",
            )
        ]

    def __str__(self):
        return f"{self.student_id} on {self.plan_id}"


class CanteenPosting(BaseModel):
    """One Monthly Posting run: "Kartik and Mangsir, Tiffin monthly, Class 1"."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_postings")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    bs_year = IntegerField()
    months = JSONField(default=list)
    date = NepaliDateField(default=ndt_today)
    class_key = CustomCharField(min_length=1, max_length=40, **_allow_empty)
    class_label = CustomCharField(min_length=1, max_length=80, **_allow_empty)
    plans = JSONField(default=list)
    entered_by = CustomCharField(min_length=1, max_length=80, **_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    def __str__(self):
        return f"{self.school_id} > posting {self.bs_year} {self.months}"


class CanteenPlanCharge(BaseModel):
    """One month of one enrolment, as posted. A month counts as posted while
    the canteen ledger entry it went onto (`txn`) is active — withdrawing the
    posting makes the month postable again, never twice."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_plan_charges")
    enrollment = ForeignKey("canteen.CanteenEnrollment", on_delete=CASCADE, related_name="charges")
    plan = ForeignKey("canteen.CanteenPlan", on_delete=CASCADE, related_name="charges")
    item = ForeignKey("canteen.CanteenItem", on_delete=CASCADE, related_name="plan_charges")
    student = ForeignKey("main.Student", on_delete=CASCADE, related_name="canteen_plan_charges")
    txn = ForeignKey("canteen.CanteenTransaction", on_delete=CASCADE, related_name="plan_charges")
    bs_year = IntegerField()
    month = IntegerField()
    amount = DecimalField(**MONEY)

    def __str__(self):
        return f"{self.enrollment_id} {self.bs_year}-{self.month} = {self.amount}"
