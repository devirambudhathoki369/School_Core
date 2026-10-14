"""School collections include student, cash and extra-billing receipts once each."""
from collections import defaultdict
from decimal import Decimal
from django.db.models import Sum, IntegerField
from django.db.models.functions import Cast, Substr
from main.models.Invoice import StudentInvoice
from extra_billing.models.Billing import ExtraInvoice


def collection_totals(query, group_by="school"):
    totals = defaultdict(Decimal)
    for model in (StudentInvoice, ExtraInvoice):
        rows = model.objects.filter(query, is_active=True)
        if group_by == "month":
            rows = rows.annotate(month=Cast(Substr("date", 6, 2), IntegerField()))
        for row in rows.order_by().values(group_by).annotate(amount=Sum("total_paid")):
            # total_paid is already the money collected, after discounts.
            totals[row[group_by]] += row["amount"] or Decimal("0")
    return dict(sorted(totals.items()))
