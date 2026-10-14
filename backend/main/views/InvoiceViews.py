from extra_billing.models.Billing import ExtraInvoice
from django.db.models import Value, CharField
from rest_framework.pagination import PageNumberPagination
import itertools
from django.db.models import Q
from rest_framework.response import Response
from rest_framework.pagination import CursorPagination
from rest_framework import status
from drf_yasg.utils import swagger_auto_schema
from django.utils import timezone

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
    StudentTokenAuthentication,
)

#
from .BaseViews import SecuredAPIView, caller_student_id, is_student_request
from .sms.SMSTemplateMixin import SMSTemplateMixin
from .sms import placeholders as PH
from ..serializers.InvoiceSerializer import StudentInvoiceSerializer
from ..models.Invoice import StudentInvoice
from ..methods.getDateRange import getDateRange
from ..methods.push import _in_background
from ..methods.genInvoiceData import (
    generateInvoiceData,
    generateInvoiceDataById,
    generateCashReceiptData,
)
from ..methods.getFeeDetails import getFeeTitlesFromTitleIds
from ..methods.getStudentLedgerDetails import (
    getStudentLedgerDetails,
    formatStudentLedgerDetails,
)
from ..methods.getStudentInvoiceDetails import (
    getStudentInvoiceDetails,
    formatStudentInvoiceDetails,
)
from ..methods.getStudentDetail import getClassDetails
from ..methods.invoiceAudit import stampEntered
from ..models.Ledger import LedgerPosting, StudentLedger
from ..models.Student import Student
from ..models.SMSLog import SMS_TYPE_PAYMENT
from ..methods.push import notify_students
from ..methods import idempotency as idem
from ..constants.payment import (
    EXCEPTION_TITLES_ALTERNATIVES,
    OPENING_BALANCE,
)
from docs.api_docs.api.payment import PAYMENT_API

STUDENT_INVOICE_RETURN_FIELDS = (
    "id",
    "invoice_id",
    "date",
    "student__id",
    "student__first_name",
    "student__middle_name",
    "student__last_name",
    "student__class_info__id",
    # Snapshot of the class at payment time (added in migration 0050).
    # Preferred over student__class_info__id when present so historical
    # transactions retain their original class even after a mid-AY promote
    # or section change.
    "class_info",
    "details",
    "payment_month",
    "total_paid",
    "mode",
    "isCashReceipt",
    "extra_info__name",
)


#
class Inv:
    # for testing;
    def __init__(self, id, date) -> None:
        self.invoice_id = id
        self.date = date


class SharedReceiptPagination(PageNumberPagination):
    page_size = 10
    # Preserve the next/previous URL cursor parameter used by existing clients.
    page_query_param = "cursor"

    def get_page_number(self, request, paginator):
        return request.query_params.get("cursor") or request.query_params.get("page") or 1


class FeePaidSMSMixin(SMSTemplateMixin):
    template_type_fee_paid = 2

    def sendFeePaidSMS(self, invoice, school_id, sms_api, contact_no):
        template = self.getSMSTemplate(school_id, self.template_type_fee_paid)
        if template:
            template = template.get("template")
            include_guardian_name = self.hasPlaceholder(template, PH.Guardian_Name_PH)
            include_classname = self.hasPlaceholder(template, PH.Class_Name_PH)
            include_paid_amount = self.hasPlaceholder(template, PH.Paid_Amount_PH)
            include_balance_amount = self.hasPlaceholder(template, PH.Balance_Amount_PH)
            student = {
                "name": (invoice.get("student_name") or ""),
                "contact_no": contact_no,
            }
            if include_guardian_name:
                student["guardian_name"] = invoice.get("guardian_name") or ""
            if include_classname:
                student["classname"] = invoice.get("class") or ""
            if include_paid_amount:
                student["total_debit"] = invoice.get("total_paid") or 0
            if include_balance_amount:
                student["balance"] = invoice.get("total_due") or 0
            data = self.prepareSMS([student], template)
            status = self.sendSMS(
                data, sms_api, school=school_id, sms_type=SMS_TYPE_PAYMENT
            )


class InvoiceViews(SecuredAPIView, FeePaidSMSMixin):
    authentication_classes = (
        AdminTokenAuthentication,
        StaffTokenAuthentication,
        StudentTokenAuthentication,
    )

    @swagger_auto_schema(**PAYMENT_API["get"])
    def get(self, request):
        """
        /api/payments?student_id=<int> \\
        returns list with {posting_months, total, particulars: {title: total}}
        """
        invoice_id = request.query_params.get("id", None)
        student_id = request.query_params.get("student", None)
        school_id = request.query_params.get("school", None)
        academic_year = request.query_params.get("academic_year")
        if is_student_request(request):
            # a student's own receipts only — not another pupil's bill by id,
            # nor the school's whole payment list
            student_id = caller_student_id(request)
        if school_id:
            if invoice_id and student_id:
                """reprint-invoice.jsx
                called by invoice-reprint! \\
                generate invoice, then return!
                """
                # fetch invoice-details, generate invoice and return invoice;
                invoice = generateInvoiceDataById(invoice_id, student_id, school_id)
                return Response(
                    {
                        "invoice": invoice,
                        "particular_format": [
                            "title",
                            "rate",
                            "paid",
                            "due",
                            "discount",
                        ],
                    }
                )
            elif student_id:
                """payment-history/trial-balance.jsx
                here, will generate and return trial-balance or student's accounting history \\
                i.e. ledgers+invoices details and remaining balance;
                """
                data = self.getTrialBalance(student_id, school_id, academic_year)
                return Response(data)
            elif invoice_id:
                """
                print cash receipt;
                """
                invoice = generateInvoiceDataById(invoice_id, None, school_id)
                return Response(
                    {
                        "invoice": invoice,
                        "particular_format": [{"PAR": "", "AMT": ""}],
                    }
                )
            # ---
            """view-transactions.jsx \\
            get all transactions of a school, applying filters; \\
            TODO : MOVE THIS TO SEARCH VIEW;
            """
            start_date = request.query_params.get("start_date")
            end_date = request.query_params.get("end_date")
            data = self.getTransactions(
                school_id,
                getDateRange(start_date, end_date) if start_date and end_date else None,
                request,
            )
            return data
        return self.RESPONSE__INVALID_REQUEST

    def _duplicateSignature(self, data):
        # Identifying fields of a fee payment / cash receipt. Two byte-identical
        # submissions (the double-click case) hash to the same key. Built from
        # the raw request so it is stable before the serializer mutates details.
        extra_info = data.get("extra_info")
        receipt_name = (
            extra_info.get("name") if isinstance(extra_info, dict) else extra_info
        )
        return idem.make_signature(
            "student_invoice",
            data.get("school"),
            data.get("student"),
            str(data.get("total_paid")),
            str(data.get("total_discount")),
            data.get("date"),
            data.get("payment_month"),
            data.get("academic_year"),
            data.get("economic_year"),
            data.get("isCashReceipt"),
            receipt_name,
            data.get("details"),
        )

    def _echoExistingInvoice(self, cached, school_id):
        # Regenerate the ORIGINAL receipt (by PK) so a double-submit shows the
        # same invoice instead of minting a second row.
        pk = cached.get("pk")
        if cached.get("isCashReceipt"):
            return generateInvoiceDataById(pk, None, school_id)
        return generateInvoiceDataById(pk, cached.get("student_id"), school_id)

    @swagger_auto_schema(**PAYMENT_API["post"], request_body=StudentInvoiceSerializer)
    def post(self, request):
        s = StudentInvoiceSerializer(data=request.data)
        school_id = request.data.get("school")
        if school_id:
            inv = None
            # Idempotency gate: block an identical payment being stored again
            # within the duplicate window (~1-2 min).
            guard_key = self._duplicateSignature(request.data)
            if not idem.reserve(guard_key):
                cached = idem.peek(guard_key)
                pk = cached.get("pk") if isinstance(cached, dict) else None
                if pk and StudentInvoice.objects.filter(id=pk, is_active=True).exists():
                    # original already saved — return its receipt, no new row
                    invoice = self._echoExistingInvoice(cached, school_id)
                    return Response(
                        {
                            "message": "This payment was already recorded a moment ago.",
                            "invoice": invoice,
                            "duplicate": True,
                        }
                    )
                # A bill deleted since is not there to be duplicated: the
                # school is entering the payment again, and answering with the
                # deleted bill would print a receipt for money nothing records.
                # It is saved as a new bill. Anything else is the original
                # still being processed by the first request.
                if not (pk and idem.reclaim(guard_key, pk)):
                    return Response(
                        {
                            "message": "This payment is being processed. Please wait a moment before retrying."
                        },
                        status=status.HTTP_409_CONFLICT,
                    )
            if s.is_valid():
                try:
                    inv = s.save()
                except Exception:
                    idem.release(guard_key)
                    raise
                # The receipt names its accountant from the history log row
                # this save just wrote (see invoiceAudit), so the first print
                # and every reprint carry the same name and time. Hence `id`
                # on both calls below.
                # inv = inv if inv else Inv(id=1, date='')
                invoice = None
                if not inv.isCashReceipt:
                    # serializer.create() works on its own copy of validated_data,
                    # so read extra_info back from the saved instance.
                    invoice = generateInvoiceData(
                        inv.invoice_id,
                        inv.date,
                        # `id` lets the old-dues line count only the invoices
                        # written BEFORE this one (this row is already saved).
                        {**s.validated_data, "extra_info": inv.extra_info, "id": inv.id},
                        school_id,
                    )  # pass invoice.id, invoice.date and validated_data!
                    # send sms
                    try:
                        sms_api = inv.school.account.sms_api
                        send_sms_on_bill_payment = (
                            inv.school.preferences.get("sms_on_bill_payment") or False
                        )
                        send_sms_on_bill_payment = self.getBooleanValue(
                            send_sms_on_bill_payment
                        )
                        contact_no = inv.student.guardian_info.guardian_contact
                        if sms_api and send_sms_on_bill_payment and contact_no:
                            # The gateway can take 45 seconds to answer. The payment
                            # is saved; the receipt, and this worker, do not wait for
                            # the SMS, which is sent and logged as before.
                            _in_background(self.sendFeePaidSMS, invoice, school_id, sms_api, contact_no)
                    except:
                        pass
                elif inv.isCashReceipt:
                    invoice = generateCashReceiptData(
                        inv.invoice_id, inv.date, {**s.validated_data, "id": inv.id}
                    )
                # app push: tell the student their payment was recorded (free,
                # always-on, independent of the SMS toggle above). Stored to inbox.
                if inv.student_id:
                    paid_total = inv.total_paid
                    notify_students(
                        school_id,
                        [inv.student_id],
                        "भुक्तानी प्राप्त भयो",
                        f"तपाईंको रू. {paid_total} भुक्तानी प्राप्त भयो। "
                        f"बिल नं. {inv.invoice_id}।",
                        "payment",
                    )
                # Hold the lock for the full window and remember the PK so an
                # identical re-submit echoes this same receipt.
                idem.fill(
                    guard_key,
                    {
                        "pk": inv.id,
                        "student_id": inv.student_id,
                        "isCashReceipt": inv.isCashReceipt,
                    },
                )
                return Response({"message": "Payment completed!", "invoice": invoice})
            else:
                # invalid payload — free the lock so a corrected retry isn't blocked
                idem.release(guard_key)
                return Response(
                    {
                        "message": "Payment could not be recorded.",
                        "errors": s.errors,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
        return self.RESPONSE__INVALID_REQUEST

    def getTrialBalance(
        self, student_id: int, school_id: int, academic_year: int
    ) -> list:
        # ledgers
        # [title-ids and data] from ledgers and invoices objects;
        [x, ledgers] = getStudentLedgerDetails(student_id, school_id, academic_year)
        [y, invoices] = getStudentInvoiceDetails(student_id, school_id, academic_year)
        titleIds = x | y
        #
        titles = getFeeTitlesFromTitleIds(titleIds)
        # print(titles)
        #
        stdLedgers = formatStudentLedgerDetails(ledgers, titles)
        stdInvoices = formatStudentInvoiceDetails(invoices, titles)
        # The time each line was entered, beside its date. A discount line
        # shares its payment's id, so it takes that payment's time.
        stampEntered(stdInvoices, StudentInvoice)
        stampEntered(
            stdLedgers,
            StudentLedger,
            (LedgerPosting, {row["id"]: row["ledger_posting"] for row in ledgers}),
        )
        data = list(itertools.chain(stdLedgers, stdInvoices))
        #
        # Resolve the student's class FOR each academic year.
        #
        # Sources of class info per row:
        #   * Regular LedgerPosting (class-wide fee posting) — class_info is the
        #     student's class during that AY. Reliable.
        #   * Opening-balance LedgerPosting (created at year-close) — class_info
        #     is the student's class in the *previous* AY (pre-promotion), so it
        #     misrepresents the AY it belongs to. Must be skipped here.
        #   * StudentInvoice — has no class_info FK; needs back-fill.
        #
        # For every row in AY X we want the class the student actually held
        # DURING AY X. We derive it from the first non-opening-balance ledger
        # in that AY; if none exists (e.g. brand-new AY with only an opening
        # balance) we fall back to Student.class_info (current/latest).
        # Build per-AY chronological list of (date, class_info) from
        # non-opening-balance ledger postings. We then resolve each row's
        # class by walking these postings up to the row's own date — so a
        # student who changes class mid-AY has each payment attributed to
        # the class they were actually in at the time of that payment.
        ay_postings = {}  # ay_id -> [(date, cls_id), ...] sorted by date
        for row in stdLedgers:
            if self._isOpeningBalanceRow(row):
                continue
            ay_id = row.get("academic_year_id")
            cls_id = row.get("class_info")
            date = row.get("date")
            if ay_id and cls_id and date:
                ay_postings.setdefault(ay_id, []).append((date, cls_id))
        for ay_id in ay_postings:
            ay_postings[ay_id].sort()
        current_student_class = (
            Student.objects.filter(id=student_id)
            .values_list("class_info", flat=True)
            .first()
        )
        for row in data:
            # Prefer the snapshot stamped on the invoice at payment time —
            # it captures the student's class even when no LedgerPosting
            # exists for that class in the AY (mid-AY class change).
            # Pre-migration invoices have None here and fall through to the
            # LedgerPosting-derived resolution below.
            # Ledger rows already carry LedgerPosting.class_info; for
            # non-opening-balance ledgers that's the right historical class
            # so we trust it too. Opening-balance ledger rows are excluded
            # because their snapshot is the prior AY's pre-promotion class.
            snapshot = row.get("class_info")
            if snapshot and not self._isOpeningBalanceRow(row):
                continue
            ay_id = row.get("academic_year_id")
            row_date = row.get("date")
            resolved = None
            postings = ay_postings.get(ay_id, []) if ay_id else []
            if postings and row_date:
                # latest posting with date <= row_date
                for p_date, p_cls in postings:
                    if p_date <= row_date:
                        resolved = p_cls
                    else:
                        break
                if not resolved:
                    # row precedes any non-opening posting in its AY
                    # (typical for opening-balance rows) — use the AY's
                    # first known class instead of a pre-promotion snapshot.
                    resolved = postings[0][1]
            if not resolved:
                resolved = current_student_class
            row["class_info"] = resolved
        #
        # Resolve human-readable class names from class_info ids.
        for row in data:
            cls_id = row.get("class_info")
            row["classname"] = self.cacheClassname(cls_id) if cls_id else ""
        #
        data = sorted(data, key=lambda item: item["date"])
        return {
            "data": data,
            "titles": {**titles, **EXCEPTION_TITLES_ALTERNATIVES},
            "particular_format": ["title_id", "paid_amount"],
        }

    def getTransactions(self, school_id: int, date: list, request) -> list:
        transactions_query = Q(
            school__id=school_id,
            is_active=True,
        )
        #
        if date:
            # print('APPLYING DATE : ', date)
            transactions_query &= Q(date__range=date)
        # Both tables share receipt numbers, but primary keys are independent.
        # Paginate their union in SQL before fetching the ten full receipt rows.
        students = StudentInvoice.objects.filter(transactions_query).annotate(
            source=Value("student", output_field=CharField())
        ).values("id", "date", "invoice_id", "source")
        extras = ExtraInvoice.objects.filter(transactions_query).annotate(
            source=Value("extra_billing", output_field=CharField())
        ).values("id", "date", "invoice_id", "source")
        combined = students.union(extras, all=True).order_by("-date", "-invoice_id", "-id", "source")
        paginator = SharedReceiptPagination()
        page = paginator.paginate_queryset(combined, request)
        student_ids = [r["id"] for r in page if r["source"] == "student"]
        extra_ids = [r["id"] for r in page if r["source"] == "extra_billing"]
        student_rows = self.formatTransactions(StudentInvoice.objects.filter(
            school_id=school_id, pk__in=student_ids
        ).values(*STUDENT_INVOICE_RETURN_FIELDS))
        mapped = {("student", row["id"]): row for row in student_rows}
        for receipt in ExtraInvoice.objects.filter(school_id=school_id, pk__in=extra_ids).select_related("party"):
            mapped[("extra_billing", receipt.pk)] = {
                "id": f"extra:{receipt.pk}", "extra_invoice_id": receipt.pk,
                "source": "extra_billing", "date": receipt.date,
                "invoice_id": receipt.invoice_id, "student_id": "",
                "student_name": receipt.party.name, "class_name": "Extra billing",
                "amount": receipt.total_paid, "month": int(receipt.date[5:7]),
                "type": "extra_billing",
                "mode": receipt.mode,
            }
        return paginator.get_paginated_response([mapped[(r["source"], r["id"])] for r in page])

    def formatTransactions(self, transactions):
        data = []
        for e in transactions:
            # Prefer the invoice-time class snapshot. Falls back to the
            # student's current class for pre-migration invoices.
            class_info_id = e.get("class_info") or e.get("student__class_info__id")
            data.append(
                {
                    "id": e.get("id"),
                    "date": e.get("date"),
                    "invoice_id": e.get("invoice_id"),
                    "student_id": e.get("student__id") or "",
                    "student_name": (
                        e.get("extra_info__name") or ""
                        if e.get("isCashReceipt")
                        else " ".join(
                            [
                                e.get(f"student__{field}_name") or ""
                                for field in ["first", "middle", "last"]
                            ]
                        )
                    ),
                    "class_name": self.cacheClassname(class_info_id),
                    "amount": e.get("total_paid") or 0,
                    "mode": e.get("mode"),
                    "month": e.get("payment_month") or "",
                    "type": e.get("isCashReceipt"),
                }
            )
        return data

    classnames = {}

    @staticmethod
    def _isOpeningBalanceRow(row: dict) -> bool:
        # Opening-balance ledger rows carry a single particular with the
        # OPENING_BALANCE key. Their class_info snapshot is the prior AY's
        # class, so they must not seed the AY → class map.
        for particular in row.get("particulars") or []:
            if particular and particular[0] == OPENING_BALANCE:
                return True
        return False

    def cacheClassname(self, class_info_id: int) -> str:
        if not class_info_id:
            return ""
        classname = self.classnames.get(class_info_id)
        if not classname:
            # print('generating class name!')
            [classname, _] = getClassDetails(class_info_id, False)
            self.classnames[class_info_id] = classname
        return classname

    @swagger_auto_schema(**PAYMENT_API["put"])
    def put(self, request):
        return self._delete(request)

    def _delete(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        delete_reason = request.data.get("remarks")
        updated_at = timezone.now()
        if id and school_id:
            item = StudentInvoice.objects.get(id=id, school=school_id)
            if item:
                item.is_active = False
                item.updated_at = updated_at
                if delete_reason:
                    item.remarks = delete_reason
                item.save()
                return Response({"message": "Invoice deleted!"})
        return self.RESPONSE__INVALID_REQUEST
