from django.db.models import ForeignKey, CASCADE

#
from .BaseModels import BaseEntry


class ContraEntry(BaseEntry):
    KEY = "CNV"
    ledger = ForeignKey("accounting.AccountingLedger", on_delete=CASCADE)
