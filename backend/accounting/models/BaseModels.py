from django.db.models import (
    IntegerField,
    CharField,
    ForeignKey,
    CASCADE,
    F,
    Manager,
    QuerySet,
    Value,
    When,
    Case,
    OuterRef,
    Q,
)
from django.core.validators import MinValueValidator, MaxValueValidator
from django.db.models.functions import Concat
from django.contrib.contenttypes.models import ContentType

#
from account.models import StaffAccount

#
from main.models.BaseModel import BaseModel, CustomCharField
from customs.NepaliDateField import NepaliDateField
from main.models.history_log.HistoryLog import HistoryLog
from . import PAYMENT_MODE_CHOICES

CREATE_ACTION = 1


class BaseEntryQuerySet(QuerySet):
    def include_mode_text(self):
        conditions = [
            When(mode=choice[0], then=Value(choice[1]))
            for choice in PAYMENT_MODE_CHOICES
        ]
        return self.annotate(
            mode_text=Case(
                *conditions, default=Value("Unknown"), output_field=CharField()
            )
        )

    def with_voucher_number(self):
        # Dynamically fetch the 'KEY' or use the default 'VCH'
        KEY = getattr(self.model, "KEY", "VCH")
        return self.annotate(
            voucher_id=Concat(
                Value(f"{KEY}-"), F("_voucher_id"), output_field=CharField()
            )
        )


class BaseEntryManager(Manager):
    def get_queryset(self):
        return BaseEntryQuerySet(self.model, using=self._db).with_voucher_number()


class BaseEntry(BaseModel):
    _voucher_id = IntegerField(db_column="voucher_id")
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    economic_year = ForeignKey("accounting.AccountingEconomicYear", on_delete=CASCADE)
    date = NepaliDateField()
    remarks = CustomCharField(min_length=3, max_length=250, null=True, blank=True)
    # particulars[]

    class Meta:
        abstract = True

    objects = BaseEntryManager()

    @property
    def voucher_id(self):
        KEY = getattr(self, "KEY", "VCH")  # 'VCH': Voucher
        return f"{KEY}-{self._voucher_id}"

    @voucher_id.setter
    def voucher_id(self, value):
        if isinstance(value, int):
            self._voucher_id = value

    def __str__(self):
        return f"{self.school.name} > {self.voucher_id}"


# CUSTOM FIELDS
class LedgerGroupField(IntegerField):
    min_value = 1
    max_value = 34

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.validators.extend(
            [MinValueValidator(self.min_value), MaxValueValidator(self.max_value)]
        )


def accountant_sq(EntryModel):
    user_type_id = ContentType.objects.get_for_model(StaffAccount).pk
    object_type_id = ContentType.objects.get_for_model(EntryModel).pk
    accountant_q = Q(
        object_id=OuterRef("pk"),
        object_type_id=object_type_id,
        user_type_id=user_type_id,
        action=CREATE_ACTION,
    )
    return HistoryLog.objects.filter(accountant_q).values("user_id")[:1]
