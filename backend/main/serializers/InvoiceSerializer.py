from decimal import Decimal

from rest_framework import serializers
from django.db import transaction

#
from ..models.Invoice import StudentInvoice, StaffInvoice
from ..models.Student import Student
from ..methods.enrichDetailsWithTitleNames import enrich_details_with_title_names
from ..constants.payment import TITLE_NAMES_KEY

_CENT = Decimal("0.01")


def _dec(v):
    try:
        return Decimal(str(v or 0))
    except Exception:
        return Decimal("0")


def _reconcile_header_discount(validated_data):
    """Keep the invoice HEADER total_discount in sync with the per-title DETAIL.

    The student-search BALANCE is header-based (Σtotal_paid + Σtotal_discount)
    while the payment ledger / receipt is detail-based (per-title amt/dis). They
    agree only when  sum(detail.amt) == total_paid + total_discount. A frontend
    miscalculation can leak a SIBLING invoice's discount onto this invoice's
    header total_discount while the detail stays correct — making the student's
    two balances disagree (see fix_invoice_discount_mismatch, applied 2026-07-15).

    Durable guard: when the detail is internally consistent
    ( sum(amt) == total_paid + sum(dis) ) but the header total_discount differs,
    trust the detail and set total_discount = sum(dis). Cash (total_paid) and
    every detail line are left untouched. Paisa-tolerant. Skips __titles (the
    FeeTitle-name snapshot, not a fee line).
    """
    details = validated_data.get("details") or {}
    sum_amt = Decimal("0")
    sum_dis = Decimal("0")
    for key, val in details.items():
        if key == TITLE_NAMES_KEY:
            continue
        if isinstance(val, dict):
            sum_amt += _dec(val.get("amt"))
            sum_dis += _dec(val.get("dis"))
    sum_amt = sum_amt.quantize(_CENT)
    sum_dis = sum_dis.quantize(_CENT)
    paid = _dec(validated_data.get("total_paid")).quantize(_CENT)
    disc = _dec(validated_data.get("total_discount")).quantize(_CENT)
    if sum_amt == paid + disc:
        return  # header already agrees with detail
    if sum_amt == paid + sum_dis and disc != sum_dis:
        validated_data["total_discount"] = sum_dis


#
class StudentInvoiceSerializer(serializers.ModelSerializer):
    invoice_id = serializers.IntegerField(required=False)
    # student : int-field for cash-receipt, primary-key-field for invoice;
    student = serializers.IntegerField(required=False)
    date = serializers.CharField(required=False)
    total_due = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    total_discount = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=250)

    class Meta:
        model = StudentInvoice
        fields = "__all__"

    def validate(self, data):
        if data.get("isCashReceipt") is False:
            # Ensure 'student' is provided if invoice but not necessary in cash receipt!
            if not data.get("student"):
                raise serializers.ValidationError(
                    {"student": "This field is required when isCashReceipt is False."}
                )
        # A payment must move money.
        if _dec(data.get("total_paid")) <= 0:
            raise serializers.ValidationError(
                {"total_paid": "Amount must be greater than 0."}
            )
        self._validate_academic_year_period(data)
        return data

    def _validate_academic_year_period(self, data):
        """Reject a bill against a closed, or another school's, academic year.

        The payment date is deliberately NOT range-checked against the year's
        start_date/end_date: those are free-text labels that many schools left
        stale (years ending 2083-03-30 still in use, end before start), and
        checking them blocked every live payment once the calendar passed them.
        """
        instance = getattr(self, "instance", None)
        academic_year = data.get("academic_year") or getattr(
            instance, "academic_year", None
        )
        school = data.get("school") or getattr(instance, "school", None)

        if not academic_year:
            raise serializers.ValidationError(
                {"academic_year": "An academic year is required for billing."}
            )
        if school and academic_year.school_id != school.id:
            raise serializers.ValidationError(
                {"academic_year": "The academic year does not belong to this school."}
            )
        if academic_year.closed:
            raise serializers.ValidationError(
                {"academic_year": "This academic year is closed and cannot accept payments."}
            )

    def to_internal_value(self, data):
        school_id = data.get("school")
        isCashReceipt = data.get("isCashReceipt")
        if school_id and not isCashReceipt:
            queryset = Student.objects.filter(class_info__school=school_id)
            self.fields["student"] = serializers.PrimaryKeyRelatedField(
                queryset=queryset, required=False
            )
        if data.get("payment_month") is None and "date" in data:
            year, month, day = map(int, data.get("date").split("-"))
            data["payment_month"] = month
        return super().to_internal_value(data)

    def create(self, validated_data):
        with transaction.atomic():
            economic_year = validated_data.get("economic_year")
            school = validated_data.get("school")
            # Invoice numbers run serially within the ECONOMIC (fiscal) year and
            # restart at 1 only when the fiscal year rolls over (Nepali 04-01) or
            # the superadmin switches the economic year — NOT when a school's
            # academic year closes mid-fiscal-year. Keying on academic_year used
            # to restart the counter on every AY close, producing duplicate
            # invoice numbers within one fiscal year. (Staff invoices already key
            # on economic_year; this aligns student invoices with that.)
            invoice_id = self.get_invoice_id(school, economic_year)
            validated_data["invoice_id"] = invoice_id
            # Snapshot FeeTitle names so historical receipts don't drift
            # when admins rename or delete titles later.
            school_id = getattr(school, "id", None) if school else None
            enrich_details_with_title_names(
                validated_data.get("details"), school_id=school_id
            )
            # Snapshot the student's class at payment time so the trial
            # balance attributes this invoice to the class the student was
            # in NOW, not to whatever LedgerPosting happens to exist in the
            # same AY (which may be stale after a mid-AY class change).
            student = validated_data.get("student")
            if student is not None and not validated_data.get("class_info"):
                validated_data["class_info_id"] = getattr(
                    student, "class_info_id", None
                )
            # Stop the header/detail discount drift at the write path so the
            # student-search BALANCE can't diverge from the payment ledger.
            # Fee invoices only (cash receipts carry no per-title dues detail).
            if not validated_data.get("isCashReceipt"):
                _reconcile_header_discount(validated_data)
            return StudentInvoice.objects.create(**validated_data)

    def get_invoice_id(self, school_id, economic_year_id):
        from ..methods.nextReceiptNumber import next_receipt_number

        return next_receipt_number(school_id, economic_year_id)

    def to_representation(self, data):
        return data


class StaffInvoiceSerializer(serializers.ModelSerializer):
    invoice_id = serializers.IntegerField(required=False)
    date = serializers.CharField(required=False)
    total_due = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    total_deduction = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    pf_deduction = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    insurance_deduction = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False
    )
    remarks = serializers.CharField(required=False, allow_blank=True, max_length=250)

    class Meta:
        model = StaffInvoice
        fields = "__all__"

    def to_internal_value(self, data):
        if data.get("payment_month") is None and "date" in data:
            year, month, day = map(int, data.get("date").split("-"))
            data["payment_month"] = month
        return super().to_internal_value(data)

    def create(self, validated_data):
        with transaction.atomic():
            ecoy = validated_data.get("economic_year")
            school = validated_data.get("school")
            prevInvoice = (
                StaffInvoice.objects.filter(school=school, economic_year=ecoy)
                .values("invoice_id")
                .order_by("-id")
                .first()
            )
            # print(prevInvoice)
            invoice_id = 1
            if prevInvoice:
                invoice_id = prevInvoice.get("invoice_id")
                invoice_id += 1
            validated_data["invoice_id"] = invoice_id
            return StaffInvoice.objects.create(**validated_data)

    def to_representation(self, data):
        return data
