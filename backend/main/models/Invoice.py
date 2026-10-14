from django.db.models import (
    JSONField,
    ForeignKey,
    IntegerField,
    DecimalField,
    BooleanField,
    CASCADE,
    OuterRef,
    Q,
)
from django.contrib.contenttypes.models import ContentType

#
from account.models import StaffAccount
from .BaseModel import BaseModel, CustomCharField
from ..models.history_log.HistoryLog import HistoryLog
from ..methods.nepaliDatetime import ndt_today
from customs.NepaliDateField import NepaliDateField

#
PAYMENT_MODES = [(1, "cash"), (2, "bank"), (3, "cheque"), (4, "wallet")]
PAYMENT_MODES_MAPPING = {key: value for key, value in PAYMENT_MODES}
CREATE_ACTION = 1


class BaseInvoice(BaseModel):
    invoice_id = IntegerField()
    date = NepaliDateField(default=ndt_today)
    details = JSONField(default=dict)
    total_paid = DecimalField(max_digits=10, decimal_places=2)
    total_due = DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    payment_month = IntegerField()
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)
    mode = IntegerField(choices=PAYMENT_MODES, default=1)
    remarks = CustomCharField(min_length=1, max_length=250, null=True, blank=True)
    academic_year = ForeignKey("main.AcademicYear", on_delete=CASCADE)
    economic_year = ForeignKey("main.EconomicYear", on_delete=CASCADE)
    extra_info = JSONField(default=dict)

    class Meta:
        abstract = True


class StudentInvoice(BaseInvoice):
    total_discount = DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    student = ForeignKey("main.Student", on_delete=CASCADE, null=True, blank=True)
    # Snapshot of the student's class at write time. Lets the trial balance
    # attribute a payment to the class the student was in when the payment was
    # made, even after a mid-AY class change (where Student.class_info has
    # since moved but no new LedgerPosting exists for the new class).
    # Nullable for pre-migration rows and cash receipts (no student).
    class_info = ForeignKey(
        "main.ClassInfo", on_delete=CASCADE, null=True, blank=True
    )
    # fast cash receipt
    isCashReceipt = BooleanField(default=False, db_index=True)


class StaffInvoice(BaseInvoice):
    staff = ForeignKey("main.Staff", on_delete=CASCADE)
    # TDS withheld at source (sum of per-title tds). Kept for back-compat.
    total_deduction = DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    # Provident fund & insurance withheld from net pay at payment time. These
    # are fixed monthly amounts carried on the staff record; like TDS they are
    # withheld from the staff's cash but still settle the salary liability.
    pf_deduction = DecimalField(
        max_digits=10, decimal_places=2, default=0, null=True, blank=True
    )
    insurance_deduction = DecimalField(
        max_digits=10, decimal_places=2, default=0, null=True, blank=True
    )


# Cash Receipt Titles
class CashReceiptTitle(BaseModel):
    title = CustomCharField(min_length=2, max_length=30)
    school = ForeignKey("main.SchoolAdmin", on_delete=CASCADE)

    def __str__(self) -> str:
        return f"Fee title : {self.title}"


def cashier_sq(model=StudentInvoice):
    user_type_id = ContentType.objects.get_for_model(StaffAccount).pk
    object_type_id = ContentType.objects.get_for_model(model).pk
    cashier_q = Q(
        object_id=OuterRef("pk"),
        object_type_id=object_type_id,
        user_type_id=user_type_id,
        action=CREATE_ACTION,
    )
    return HistoryLog.objects.filter(cashier_q).values("user_id")[:1]


# NOTE:
"""
StudentInvoice:
total_paid : (The total_discount is not already subtracted.)
"""
"""
StaffInvoice:
total_paid : (The total_deduction is already subtracted.)
"""
