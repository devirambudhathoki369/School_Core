"""What was sold at the counter.

    CanteenSale       one ring-up: who bought, how they paid, the total
      CanteenSaleLine   one item on it, at the price it was sold for

A sale is never deleted. A mistake is VOIDED: the row goes inactive, a reason is
kept beside it, the account purchase it made goes inactive with it (so the money
is back on the card at once), and the sale number is never given out again.
"""

from django.db.models import (
    CASCADE,
    SET_NULL,
    DateTimeField,
    DecimalField,
    ForeignKey,
    IntegerField,
    JSONField,
    Model,
    Q,
    UniqueConstraint,
)

from customs.NepaliDateField import NepaliDateField
from main.methods.nepaliDatetime import ndt_today
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty

from ..constants import BUYER_CHOICES, BUYER_WALKIN, PAY_CASH, PAYMENT_CHOICES

MONEY = {"max_digits": 10, "decimal_places": 2}


class CanteenSale(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_sales")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    # Its own series per school and fiscal year — a snack counter rings up
    # hundreds a day, and those must not fill the school's fee receipt book.
    sale_no = IntegerField()
    date = NepaliDateField(default=ndt_today)
    entered_at = DateTimeField(auto_now_add=True)
    buyer_type = IntegerField(choices=BUYER_CHOICES, default=BUYER_WALKIN)
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="canteen_sales", **_allow_empty
    )
    staff = ForeignKey(
        "main.Staff", on_delete=CASCADE, related_name="canteen_sales", **_allow_empty
    )
    # A walk-in's name if the counter wrote one; otherwise blank.
    buyer_name = CustomCharField(min_length=1, max_length=60, **_allow_empty)
    payment = IntegerField(choices=PAYMENT_CHOICES, default=PAY_CASH)
    total = DecimalField(**MONEY)
    entered_by = CustomCharField(min_length=1, max_length=80, **_allow_empty)
    # Sent by the counter with every ring-up. A request retried over a bad
    # connection carries the same key and gets the sale it already made back,
    # instead of charging the child twice.
    client_key = CustomCharField(min_length=8, max_length=64, **_allow_empty)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)
    extra_info = JSONField(default=dict)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("school", "economic_year", "sale_no"),
                name="uniq_canteen_sale_number_per_fiscal_year",
            ),
            UniqueConstraint(
                fields=("school", "client_key"),
                condition=Q(client_key__isnull=False),
                name="uniq_canteen_sale_client_key",
            ),
        ]

    def __str__(self):
        return f"{self.school_id} > sale {self.sale_no} = {self.total}"


class CanteenSaleLine(Model):
    """A plain Model, not a BaseModel: lines are written once with their sale
    and never edited, and a history-log row per samosa would bury the log the
    office actually reads."""

    sale = ForeignKey("canteen.CanteenSale", on_delete=CASCADE, related_name="lines")
    item = ForeignKey(
        "canteen.CanteenItem", on_delete=SET_NULL, related_name="sale_lines", **_allow_empty
    )
    # Snapshots: what the slip said, whatever the item is called or costs later.
    name = CustomCharField(min_length=1, max_length=60)
    price = DecimalField(**MONEY)
    qty = IntegerField(default=1)
    amount = DecimalField(**MONEY)

    def __str__(self):
        return f"{self.sale_id}: {self.qty} x {self.name}"
