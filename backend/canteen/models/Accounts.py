"""A buyer's canteen account, and every rupee that moved through it.

    CanteenAccount        one per student or member of staff who uses it
      CanteenTransaction    payment, purchase, refund, monthly posting — the canteen's own ledger

ONE ACCOUNT, BOTH WAYS
----------------------
A prepaid card and a canteen tab are the same thing seen from either side of
zero: a family tops up and the balance is positive; a school that allows credit
lets it go negative down to the account's credit limit. Keeping them as one
running account (rather than a "wallet" table and a "tab" table) means there is
one balance to show a parent, one statement, and no question of which of two
balances a sale should have come out of.

A BALANCE IS NEVER STORED. It is the sum of the account's active transactions,
computed where it is shown (`methods/balances.py`), for the same reason Extra
Billing and the hostel never store one: a stored total drifts the first time a
row is changed outside the one code path that maintains it, and a drifted
balance is an argument with a parent.

The account row is still written to on every sale — it is the row locked
(`select_for_update`) while a sale checks the balance, so two counters cannot
both spend the last Rs. 50 of the same card.
"""

from django.db.models import (
    CASCADE,
    BooleanField,
    CheckConstraint,
    DateTimeField,
    DecimalField,
    ForeignKey,
    IntegerField,
    JSONField,
    Q,
    TextField,
    UniqueConstraint,
)

from customs.NepaliDateField import NepaliDateField
from main.methods.nepaliDatetime import ndt_today
from main.models.BaseModel import BaseModel, CustomCharField, _allow_empty

from ..constants import MODE_CASH, MODES, TXN_CHOICES

MONEY = {"max_digits": 10, "decimal_places": 2}


class CanteenAccount(BaseModel):
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_accounts")
    student = ForeignKey(
        "main.Student", on_delete=CASCADE, related_name="canteen_accounts", **_allow_empty
    )
    staff = ForeignKey(
        "main.Staff", on_delete=CASCADE, related_name="canteen_accounts", **_allow_empty
    )
    # Blank = the school's default (CanteenSettings). A figure here overrides
    # it for this one buyer: a higher daily limit for a boarder, no credit for
    # a family that asked for none.
    daily_limit = DecimalField(**MONEY, **_allow_empty)
    credit_limit = DecimalField(**MONEY, **_allow_empty)
    # A lost card is blocked, not deleted: the balance on it is the family's
    # money and stays to be moved or refunded.
    is_blocked = BooleanField(default=False)
    block_reason = CustomCharField(min_length=1, max_length=100, **_allow_empty)
    # Allergies, "no fried food", "lunch only" — shown at the counter the
    # moment the buyer is picked.
    notes = TextField(**_allow_empty)
    # The day (BS) the family was last sent a dues reminder — at most one a day.
    last_reminded = NepaliDateField(**_allow_empty)

    class Meta:
        constraints = [
            CheckConstraint(
                condition=(
                    Q(student__isnull=False, staff__isnull=True)
                    | Q(student__isnull=True, staff__isnull=False)
                ),
                name="canteen_account_is_student_xor_staff",
            ),
            UniqueConstraint(
                fields=("school", "student"),
                condition=Q(is_active=True, student__isnull=False),
                name="uniq_active_canteen_account_per_student",
            ),
            UniqueConstraint(
                fields=("school", "staff"),
                condition=Q(is_active=True, staff__isnull=False),
                name="uniq_active_canteen_account_per_staff",
            ),
        ]

    def __str__(self):
        who = f"student {self.student_id}" if self.student_id else f"staff {self.staff_id}"
        return f"{self.school_id} > canteen account of {who}"


class CanteenTransaction(BaseModel):
    """One movement on an account. `amount` is SIGNED (see constants.TXN_*)."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="canteen_transactions")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    account = ForeignKey(
        "canteen.CanteenAccount", on_delete=CASCADE, related_name="transactions"
    )
    kind = IntegerField(choices=TXN_CHOICES)
    amount = DecimalField(**MONEY)
    date = NepaliDateField(default=ndt_today)
    entered_at = DateTimeField(auto_now_add=True)
    # The sale this purchase paid for (purchases only).
    sale = ForeignKey(
        "canteen.CanteenSale", on_delete=CASCADE, related_name="transactions", **_allow_empty
    )
    # Top-ups and refunds are money across the office desk, so each gets a
    # receipt number: its own series per school and fiscal year, voided ones
    # keep theirs.
    receipt_no = IntegerField(**_allow_empty)
    mode = IntegerField(choices=MODES, default=MODE_CASH)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)
    # Who did it, as their name read then — a slip handed to a parent says who
    # took the money, whoever reprints it later.
    entered_by = CustomCharField(min_length=1, max_length=80, **_allow_empty)
    # ITEM-WISE: {"<item id>": "amount", ..., "__titles": {"<item id>": "Tiffin"}}.
    # A charge (purchase, posting) names what was charged; a payment names
    # what it pays, and whatever it does not name is an advance. Amounts are
    # strings, read with money.exact — nothing here is ever added as a float.
    details = JSONField(default=dict)
    # POSTING only: the months it charges, Nepali months, 1 = Baisakh.
    months = JSONField(default=list)
    posting = ForeignKey(
        "canteen.CanteenPosting", on_delete=CASCADE, related_name="transactions", **_allow_empty
    )
    # {"balance_after": "..."}; {"void_reason": "..."} once voided.
    extra_info = JSONField(default=dict)

    class Meta:
        constraints = [
            UniqueConstraint(
                fields=("school", "economic_year", "receipt_no"),
                condition=Q(receipt_no__isnull=False),
                name="uniq_canteen_receipt_number_per_fiscal_year",
            )
        ]

    def __str__(self):
        return f"{self.account_id} {self.get_kind_display()} {self.amount}"
