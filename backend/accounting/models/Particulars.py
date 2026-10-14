from django.db.models import (
    Manager,
    F,
    Model,
    IntegerField,
    DecimalField,
    Value,
    CharField,
    ForeignKey,
    QuerySet,
    CASCADE,
)
from django.db.models.functions import Concat
from django.db.models.sql.query import Query

#
from main.models.BaseModel import CustomCharField
from . import BALANCE_TYPE_CHOICES


class BaseParticularQueryset(QuerySet):
    def with_voucher_number(self):
        # Dynamically fetch the 'KEY' or use the default 'VCH'
        KEY = getattr(self.model, "KEY", "VCH")
        return self.annotate(
            voucher_id=Concat(
                Value(f"{KEY}-"), F("entry___voucher_id"), output_field=CharField()
            )
        )


class BaseParticularManager(Manager):
    def get_queryset(self):
        return (
            BaseParticularQueryset(self.model, using=self._db)
            .select_related("entry")
            .annotate(
                ledger_str=F("ledger__name"),
            )
        )


class BaseParticular(Model):
    KEY = "VCH"
    ledger = ForeignKey("accounting.AccountingLedger", on_delete=CASCADE)
    # 18 digits so large voucher amounts save (was 10 = capped at ~10 crore).
    amount = DecimalField(max_digits=18, decimal_places=2)
    remarks = CustomCharField(min_length=3, max_length=250)

    objects = BaseParticularManager()

    class Meta:
        abstract = True


class IncomeParticular(BaseParticular):
    KEY = "INV"
    entry = ForeignKey("accounting.IncomeEntry", on_delete=CASCADE)


class ExpenseParticular(BaseParticular):
    KEY = "EXV"
    entry = ForeignKey("accounting.ExpenseEntry", on_delete=CASCADE)


class JournalParticular(BaseParticular):
    KEY = "JRV"
    type = IntegerField(choices=BALANCE_TYPE_CHOICES)
    entry = ForeignKey("accounting.JournalEntry", on_delete=CASCADE)


class ContraParticular(BaseParticular):
    KEY = "CNV"
    entry = ForeignKey("accounting.ContraEntry", on_delete=CASCADE)
