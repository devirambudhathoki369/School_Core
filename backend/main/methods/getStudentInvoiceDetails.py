from django.db.models import Q

#
from decimal import Decimal
from ..models.Invoice import StudentInvoice
from .extractTitleIds import extractTitleIdsFromInvoices
from ..constants.payment import (
    EXCEPTION_TITLES,
    EXCEPTION_TITLES_ALTERNATIVES,
    INVOICE_DETAILS,
    TITLE_NAMES_KEY,
)


def getStudentInvoiceDetails(student_id: int, school_id: int, academic_year: int):
    """
    used for student's trial balance!
    """
    query = Q(
        student__id=student_id,
        school__id=school_id,
        is_active=True,
        isCashReceipt=False,
    )
    if academic_year:
        query &= Q(academic_year=academic_year)
    invoices = StudentInvoice.objects.filter(query).values(
        "id",
        "invoice_id",
        "date",
        "details",
        "payment_month",
        "total_paid",
        "mode",
        "extra_info",
        "academic_year",
        "academic_year__name",
        "class_info",
    )
    ids = extractTitleIdsFromInvoices(invoices)
    return [ids, invoices]


def particularDiscount(detail: dict, discount: float, particulars: list = None):
    # One line per fee title the discount was actually given on. It used to be a
    # single "discount on invoice N" lump, which left no way to tell WHICH title
    # was discounted — the entry is per title, so the statement is too. The
    # labels are resolved here (not left as title ids) because the reader maps
    # ids through the fee-title list, and these rows are not fee rows.
    return {
        "id": detail["id"],
        # The receipt the discount was given on. The old lump label carried this
        # ("discount on invoice N"); the per-title labels have no room for it, so
        # it moves to the column that already exists for it.
        "invoice_id": detail.get("invoice_id") or "",
        "date": detail["date"],
        "discount_amount": discount,
        "months": detail["months"],
        "particulars": particulars
        or [[f"discount on invoice {detail['invoice_id']}", discount]],
        "class_info": detail.get("class_info"),
        "academic_year_id": detail.get("academic_year_id"),
        "academic_year_name": detail.get("academic_year_name") or "",
    }


def titleLabel(title, title_snapshot: dict, titles: dict) -> str:
    """Readable name for a title key, preferring the name snapshotted on the
    invoice so a renamed or deleted fee title still reads as it did on the
    original receipt."""
    if title in EXCEPTION_TITLES:
        return EXCEPTION_TITLES_ALTERNATIVES.get(title, str(title))
    name = title_snapshot.get(str(title))
    if not name:
        try:
            name = titles.get(int(title))
        except (TypeError, ValueError):
            name = None
    return str(name or title)


def formatStudentInvoiceDetails(
    invoices: list, titles: dict, detailed_titles: bool = False
) -> list:
    """
    used for student's trial balance! \\
    returns [
        [
            {
                date, credit_amount, months, 
                particulars: [[title, amount], ...]
            }, ...
        ],
        {}
    ]
    """
    data = []
    for invoice in invoices:
        det = {
            "id": invoice.get("id") or "",
            "invoice_id": invoice.get("invoice_id") or "",
            "date": invoice.get("date") or "",
            "credit_amount": invoice.get("total_paid") or 0,
            "mode": invoice.get("mode"),
            "months": invoice.get("payment_month") or [],
            "academic_year_name": invoice.get("academic_year__name") or "",
            "academic_year_id": invoice.get("academic_year"),
            # Snapshot captured at invoice-write time (see
            # StudentInvoiceSerializer.create). May be None for pre-migration
            # rows; getTrialBalance falls back to LedgerPosting derivation in
            # that case.
            "class_info": invoice.get("class_info"),
        }
        totalDiscount = 0
        discountParticulars = []
        det["particulars"] = []
        # Snapshot of FeeTitle names captured at write time. Prefer this so
        # historical receipts render the original label even if the FeeTitle
        # has since been renamed or deleted.
        title_snapshot = invoice["details"].get(TITLE_NAMES_KEY) or {}
        for title, value in invoice["details"].items():
            if title == TITLE_NAMES_KEY:
                continue
            titleDiscount = Decimal(value.get(INVOICE_DETAILS["DISCOUNT"]) or 0)
            if titleDiscount:
                discountParticulars.append(
                    [
                        f"discount · {titleLabel(title, title_snapshot, titles)}",
                        titleDiscount,
                    ]
                )
            if detailed_titles:
                if title in EXCEPTION_TITLES:
                    title = EXCEPTION_TITLES_ALTERNATIVES[title]
                else:
                    title = (
                        title_snapshot.get(str(title))
                        or titles.get(int(title))
                    )
            amount = Decimal(value.get(INVOICE_DETAILS["AMOUNT"]) or 0)
            amount -= titleDiscount
            det["particulars"].append([title, amount])
            totalDiscount += titleDiscount
        data.append(det)
        if totalDiscount:
            data.append(particularDiscount(det, totalDiscount, discountParticulars))
    # print(data)
    return data
