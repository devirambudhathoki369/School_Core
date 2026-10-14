from django.db.models import (
    ForeignKey,
    IntegerField,
    UniqueConstraint,
    CASCADE,
)

#
from .BaseModel import BaseModel, CustomCharField
from ..methods.nepaliDatetime import ndt_today
from customs.NepaliDateField import NepaliDateField


class StudentTaxInvoice(BaseModel):
    """A tax invoice number issued against a fee posting.

    Unlike a payment receipt, a tax invoice documents what was *charged*, so it
    has nothing to hang a number on in StudentInvoice. This table is that
    ledger: one row per posting that has ever been printed as a tax invoice.

    The number is minted on the FIRST print and reused forever after, so a
    reprint always shows the paper the guardian already holds. Numbers run
    serially within a school's ECONOMIC (fiscal) year and restart at 1 when the
    fiscal year rolls over — the same rule the bill/receipt number follows (see
    InvoiceSerializer.get_invoice_id).

    `source_key` is the stable identity of the posting the invoice was issued
    for, so the lookup survives anything that renumbers or re-derives rows:
      - `ledger:<StudentLedger.id>`  — one debit row in the trial balance
      - `posting:<student>:<ay>:<months_index>` — a class-wise merged posting
    It is unique per school (NOT per fiscal year): the posting keeps the number
    it was first issued, even if reprinted in a later year.
    """

    invoice_id = IntegerField()
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    student = ForeignKey("main.Student", on_delete=CASCADE, null=True, blank=True)
    source_key = CustomCharField(min_length=1, max_length=150)
    # The posting's own date — what gets printed, never the day of printing.
    date = NepaliDateField(default=ndt_today)

    class Meta:
        constraints = [
            # A number is handed out once per school per fiscal year. This is
            # the guard that makes "shouldn't get repeated" true even if two
            # cashiers print at the same instant.
            UniqueConstraint(
                fields=["school", "economic_year", "invoice_id"],
                name="unique_tax_invoice_number_per_fiscal_year",
            ),
            # One posting can only ever hold one tax invoice number.
            UniqueConstraint(
                fields=["school", "source_key"],
                name="unique_tax_invoice_per_posting",
            ),
        ]

    def __str__(self) -> str:
        return f"Tax invoice {self.invoice_id} ({self.source_key})"
