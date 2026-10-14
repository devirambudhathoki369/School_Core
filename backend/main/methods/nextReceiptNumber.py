from django.db.models import Max


def next_receipt_number(school, economic_year):
    """Allocate under the school lock; caller must keep its atomic block through save."""
    from main.models.SchoolAdmin import SchoolAdmin
    from main.models.Invoice import StudentInvoice
    from extra_billing.models.Billing import ExtraInvoice

    school_id = getattr(school, "pk", school)
    year_id = getattr(economic_year, "pk", economic_year)
    # A stable row also locks an empty receipt book and serializes both tables.
    SchoolAdmin.objects.select_for_update().get(pk=school_id)
    numbers = [
        model.objects.filter(school_id=school_id, economic_year_id=year_id)
        .aggregate(last=Max("invoice_id"))["last"] or 0
        for model in (StudentInvoice, ExtraInvoice)
    ]
    # Include voided receipts: issued numbers must never be reused.
    return max(numbers) + 1
