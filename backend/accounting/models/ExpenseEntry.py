from django.db.models import IntegerField, ForeignKey, CASCADE

#
from .BaseModels import BaseEntry
from . import PAYMENT_MODE_CHOICES


class ExpenseEntry(BaseEntry):
    KEY = "EXV"
    mode = IntegerField(choices=PAYMENT_MODE_CHOICES)
    ledger = ForeignKey("accounting.AccountingLedger", on_delete=CASCADE)
