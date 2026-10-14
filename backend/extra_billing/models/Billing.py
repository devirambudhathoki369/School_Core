"""The money: what was charged, and what was collected.

    ExtraLedgerPosting   one bill run — "Shrawan, for these parties"
      ExtraLedger          one party's charge row from that run
    ExtraInvoice         one receipt

THE SHAPE IS DELIBERATELY THE STUDENT SHAPE
-------------------------------------------
`LedgerPosting -> StudentLedger` and `StudentInvoice` are how this product has
always recorded a bill and a receipt, and every accountant using it reads that
vocabulary. Copying it (rather than inventing a prettier one) means a school's
office staff already know how to read these screens, and it keeps the two sides
comparable when a school asks "what did we collect in Shrawan" about BOTH.

It is a separate set of tables, though, not a column on the student ones: the
student tables are keyed on a student and a class, both of which are meaningless
for a shutter tenant, and widening them would put a nullable student on every
dues report in the product.

A BALANCE IS NEVER STORED. It is
    opening_due + sum(active ExtraLedger.total) - sum(active ExtraInvoice.total_paid)
computed where it is shown, for the same reason hostel occupancy is counted
rather than kept: a stored total drifts the first time a row is edited outside
the one code path that maintains it, and a drifted balance is a fight with a
tenant.
"""

from django.db.models import (
    CASCADE,
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

from ..constants import MODE_CASH, PAYMENT_MODES

MONEY = {"max_digits": 12, "decimal_places": 2}


class ExtraLedgerPosting(BaseModel):
    """One bill run: the school raised these months' charges on this day."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="extra_postings")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    date = NepaliDateField(default=ndt_today)
    # Nepali month numbers, 1 = Baisakh. Empty for a one-off charge (a repair
    # recovered from a tenant belongs to no month).
    months = JSONField(default=list)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    def __str__(self):
        return f"{self.school_id} > posting {self.id} {self.months}"


class ExtraLedger(BaseModel):
    """One party's charge from one run — the debit side of their account."""

    posting = ForeignKey(
        "extra_billing.ExtraLedgerPosting", on_delete=CASCADE, related_name="ledgers", **_allow_empty
    )
    party = ForeignKey("extra_billing.BillingParty", on_delete=CASCADE, related_name="ledgers")
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="extra_ledgers")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    date = NepaliDateField(default=ndt_today)
    months = JSONField(default=list)
    # {"<BillingTitle id>": amount, ..., "__titles": {"<id>": "Rent"}}
    details = JSONField(default=dict)
    total = DecimalField(**MONEY)
    remarks = CustomCharField(min_length=1, max_length=120, **_allow_empty)

    def __str__(self):
        return f"{self.party_id} charged {self.total}"


class ExtraInvoice(BaseModel):
    """One receipt — the credit side of a party's account."""

    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE, related_name="extra_invoices")
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    party = ForeignKey("extra_billing.BillingParty", on_delete=CASCADE, related_name="invoices")
    # Shared with student and cash receipts within the school and fiscal year.
    invoice_id = IntegerField()
    date = NepaliDateField(default=ndt_today)
    # {"<BillingTitle id>": amount paid against it, "od": amount, "__titles": {...}}
    details = JSONField(default=dict)
    total_paid = DecimalField(**MONEY)
    # The party's balance AFTER this receipt, snapshotted so a reprint shows the
    # same paper the payer was handed.
    total_due = DecimalField(**MONEY, null=True, blank=True)
    mode = IntegerField(choices=PAYMENT_MODES, default=MODE_CASH)
    remarks = CustomCharField(min_length=1, max_length=250, **_allow_empty)
    extra_info = JSONField(default=dict)

    class Meta:
        constraints = [
            # One number per school per fiscal year, enforced by the database so
            # it holds even when two cashiers save at the same instant. Voided
            # receipts keep their number: a gap in a receipt book is a record,
            # a reused number is a fraud.
            UniqueConstraint(
                fields=("school", "economic_year", "invoice_id"),
                name="uniq_extra_invoice_number_per_fiscal_year",
            )
        ]

    def __str__(self):
        return f"Extra receipt {self.invoice_id} ({self.party_id})"
