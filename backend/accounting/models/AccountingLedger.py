"""
AccountingLedger:
- name
- ledger-group
- address
- contact
- opening-balance
- balance-type : dr/cr (based on natural side or user selected based on balance)
- economic-year
"""

from django.db.models import IntegerField, DecimalField, ForeignKey, CASCADE

#
from main.models.BaseModel import BaseModel, CustomCharField
from .BaseModels import LedgerGroupField
from . import BALANCE_TYPE_CHOICES, BALANCE_CONFIG


class AccountingLedger(BaseModel):
    name = CustomCharField(min_length=3, max_length=30)
    ledger_group = LedgerGroupField()
    address = CustomCharField(min_length=2, max_length=50, null=True, blank=True)
    contact = CustomCharField(
        min_length=6, max_length=10, null=True, blank=True
    )  # telephone/mobile number
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    def __str__(self):
        return f"{self.school.name} > {self.name}"


class AccountingLedgerBalance(BaseModel):
    balance_type = IntegerField(choices=BALANCE_TYPE_CHOICES)
    opening_balance = DecimalField(**BALANCE_CONFIG)
    ledger = ForeignKey("accounting.AccountingLedger", on_delete=CASCADE)
    economic_year = ForeignKey("accounting.AccountingEconomicYear", on_delete=CASCADE)

    class Meta:
        unique_together = ("ledger", "economic_year")
