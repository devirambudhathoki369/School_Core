from django.db.models import IntegerField, ForeignKey, CASCADE

#
from .BaseModels import BaseEntry
from . import PAYMENT_MODE_CHOICES


class IncomeEntry(BaseEntry):
    KEY = "INV"
    mode = IntegerField(choices=PAYMENT_MODE_CHOICES)
    ledger = ForeignKey("accounting.AccountingLedger", on_delete=CASCADE)
