from django.db.models import Q, Value, CharField, F, OuterRef, Subquery, Sum
from django.db.models.functions import Concat, Collate, Lower
from django.contrib.postgres.aggregates import ArrayAgg
from django.utils import timezone

#
from rest_framework.response import Response
from rest_framework import status
from rest_framework.pagination import CursorPagination
from decimal import Decimal
import itertools

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.constants.payment import INVOICE_DETAILS

#
from ..models.Staff import Staff
from ..models.Invoice import StaffInvoice
from ..models.Ledger import StaffLedger
from .BaseViews import SecuredAPIView
from ..serializers.InvoiceSerializer import StaffInvoiceSerializer
from ..methods.genInvoiceData import (
    generateStaffInvoiceData,
    generateStaffInvoiceDataById,
)
from ..methods.getDateRange import getDateRange
from ..methods.invoiceAudit import stampEntered
from ..methods.payrollClose import (
    NOT_CARRY,
    closedPayrollMessage,
    closedPayrollYearIds,
    duesBroughtForward,
)
from ..constants.payment import CARRY_FORWARD_OUT
from ..constants.payroll import TITLE_LABELS
from .LedgerViewsStaff import ALL_TITLES


class InvoiceCursorPagination(CursorPagination):
    page_size = 10
    ordering = "-id"


class SalarySheet:
    STATUS_EMPLOYED = 1

    def getSalarySheet(self, school_id, date_range):
        q = Q(
            school=school_id,
            staff=OuterRef("pk"),
            is_active=True,
            date__range=date_range,
        )
        # A balance carried in or out at a year-close is not salary posted:
        # counted here it would land in Gross (and so in Net and Balance) of
        # both years. What a member of staff was owed coming into the range has
        # a column of its own, below.
        ledger_sq = (
            StaffLedger.objects.filter(q & NOT_CARRY)
            .values("staff")  # grouped by staff-id
            .annotate(ledger_details=ArrayAgg("details"), ledger_total=Sum("total"))
            .values("ledger_details", "ledger_total")
        )
        invoice_sq = (
            StaffInvoice.objects.filter(q)
            .values("staff")
            .annotate(
                total_paid_amount=Sum("total_paid"),
                total_deducted_amount=Sum("total_deduction"),
                total_pf_amount=Sum("pf_deduction"),
                total_insurance_amount=Sum("insurance_deduction"),
            )
            .values(
                "total_paid_amount",
                "total_deducted_amount",
                "total_pf_amount",
                "total_insurance_amount",
            )[:1]
        )
        #
        data = (
            Staff.objects.filter(school=school_id)
            .annotate(
                staff=F("id"),
                name=Concat(
                    "first_name",
                    Value(" "),
                    "middle_name",
                    Value(" "),
                    "last_name",
                    output_field=CharField(),
                ),
                designation=F("role__role"),
                total=Subquery(ledger_sq.values("ledger_total")),  # ledgers-total
                ledger_details=Subquery(ledger_sq.values("ledger_details")),
                total_paid=Subquery(invoice_sq.values("total_paid_amount")),
                total_deduction=Subquery(invoice_sq.values("total_deducted_amount")),
                total_pf=Subquery(invoice_sq.values("total_pf_amount")),
                total_insurance=Subquery(invoice_sq.values("total_insurance_amount")),
            )
            .order_by(Collate("name", "und-x-icu"))
            .values(
                "staff",
                "name",
                "designation",
                "total",
                "ledger_details",
                "total_paid",
                "total_deduction",
                "total_pf",
                "total_insurance",
                "status",
                "is_active",
            )
        )
        #
        brought = duesBroughtForward(school_id, *self.rangeAsText(date_range))
        data = [
            self.extractDetails(each, brought.get(each["staff"]) or 0)
            for each in data
            if self.belongsOnSheet(each, brought.get(each["staff"]) or 0)
        ]
        return Response(data)

    def belongsOnSheet(self, staff_data, previous_dues):
        """The working staff, and with them anyone who is not working here now
        but is owed (or was posted or paid) something in the range.

        The sheet listed working staff only. A teacher who left with salary
        unpaid then appeared nowhere on it, and the sheet's total fell short of
        what the school really owed by exactly those people.
        """
        if staff_data["status"] == self.STATUS_EMPLOYED:
            return True
        return bool(
            staff_data.pop("is_active", True)
            and (
                previous_dues
                or staff_data.get("ledger_details")
                or staff_data.get("total_paid")
                or staff_data.get("total_deduction")
            )
        )

    def rangeAsText(self, date_range):
        """The range as the zero-padded BS text the date columns hold."""
        return [
            d if isinstance(d, str) else d.strftime("%Y-%m-%d") for d in date_range
        ]

    def extractDetails(self, staff_data, previous_dues=0):
        staff_data.pop("is_active", None)
        ledger_details = staff_data.pop("ledger_details")
        total_paid = staff_data.pop("total_paid", 0) or 0
        total_deducted = staff_data.pop("total_deduction", 0) or 0
        total_pf = staff_data.pop("total_pf", 0) or 0
        total_insurance = staff_data.pop("total_insurance", 0) or 0
        ledger_total = staff_data.get("total") or 0
        # gross earnings posted, total withholdings, true net and what's left
        gross_total = ledger_total if ledger_details else 0
        deduction = total_deducted + total_pf + total_insurance
        net_salary = gross_total - deduction  # NET = gross earnings - deductions
        # What is still payable at the end of the range: what they were owed
        # coming into it, plus this range's net, less what was paid in it. With
        # the opening line this is the figure the payment screen shows.
        balance = previous_dues + net_salary - total_paid
        summary = {
            "previous_dues": previous_dues,
            "total": gross_total,
            "tax": total_deducted,
            "pf": total_pf,
            "insurance": total_insurance,
            "deduction": deduction,
            "net": net_salary,
            "paid": total_paid,
            "balance": balance,
        }
        if not ledger_details:
            return {**staff_data, **{title: 0 for title in ALL_TITLES}, **summary}
        #
        details = {**{title: 0 for title in ALL_TITLES}, **summary}
        for detail in ledger_details:
            for title in ALL_TITLES:
                titleAmount = Decimal(detail.get(title) or 0)
                details[title] += titleAmount
        staff_data = {**staff_data, **details}
        return staff_data


class StaffInvoiceView(SecuredAPIView, SalarySheet):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def tempo(self):
        """
        for bill testing!
        """
        inv = StaffInvoice.objects.get(id=1)
        invoice = generateStaffInvoiceData(inv.invoice_id, inv.date, inv.__dict__, 3)
        return Response({"message": "Payment completed!", "invoice": invoice})

    def post(self, request):
        # return self.tempo()
        s = StaffInvoiceSerializer(data=request.data)
        school_id = request.data.get("school")
        # A closed payroll year takes no more payments: what was still owed
        # there is paid from the next year's old dues.
        closed = closedPayrollMessage(school_id, request.data.get("economic_year"))
        if closed:
            return Response({"message": closed}, status=status.HTTP_400_BAD_REQUEST)
        if school_id:
            inv = None
            if s.is_valid():
                inv = s.save()
                # inv = inv if inv else Inv(id=1, date='')
                # `id` so the slip can name the account that saved it
                invoice = generateStaffInvoiceData(
                    inv.invoice_id, inv.date, {**s.validated_data, "id": inv.id}, school_id
                )  # pass invoice.id, invoice.date and validated_data!
                return Response({"message": "Payment completed!", "invoice": invoice})
            # else:
            #     print("staff-invoice")
            #     print(s.errors)
        return self.RESPONSE__INVALID_REQUEST

    def get(self, request):
        invoice_id = request.query_params.get("id", None)
        staff_id = request.query_params.get("staff", None)
        school_id = request.query_params.get("school", None)
        if school_id:
            if invoice_id and staff_id:
                """reprint-invoice.jsx
                called by invoice-reprint! \\
                generate invoice, then return!
                """
                invoice = generateStaffInvoiceDataById(invoice_id, staff_id, school_id)
                return Response({"invoice": invoice})
            elif staff_id:
                """staff trial balance"""
                data = self.getTrialBalance(staff_id, school_id)
                return Response(data)
            elif invoice_id:
                invoice = generateStaffInvoiceDataById(invoice_id, None, school_id)
                return Response({"invoice": invoice})
            start_date = request.query_params.get("start_date")
            end_date = request.query_params.get("end_date")
            salary_sheet = request.query_params.get("salary_sheet") or False
            if salary_sheet and start_date and end_date:
                date_range = getDateRange(start_date, end_date)
                # one salary sheet for every API version: the v2 route used to
                # call a method that was never written, and answered 500
                return self.getSalarySheet(school_id, date_range)
            data = self.getTransactions(
                school_id,
                getDateRange(start_date, end_date) if start_date and end_date else None,
                request,
            )
            return data
        return self.RESPONSE__INVALID_REQUEST

    def getTrialBalance(self, staff_id: int, school_id: int) -> dict:
        _common_fields = ("id", "date", "details", "economic_year_id")
        _extra_ledger_fields = ("months", "total", "remarks")
        _extra_invoice_fields = (
            "payment_month",
            "invoice_id",
            "total_paid",
            "total_deduction",
            "pf_deduction",
            "insurance_deduction",
        )

        q = Q(school=school_id, staff=staff_id, is_active=True)
        # by id, so that of two lines on one date the earlier entry comes
        # first -- the sort below is stable
        ledgers = list(
            StaffLedger.objects.filter(q)
            .order_by("id")
            .values(*_common_fields, *_extra_ledger_fields)
        )
        invoices = list(
            StaffInvoice.objects.filter(q)
            .order_by("id")
            .values(*_common_fields, *_extra_invoice_fields)
        )
        # A line of a closed payroll year can no longer be deleted; the page
        # reads `closed` to leave the button off rather than offer a refusal.
        closed_years = closedPayrollYearIds(school_id)
        for row in (*ledgers, *invoices):
            row["closed"] = row.pop("economic_year_id") in closed_years
        ledgers = self.formatLedgers(ledgers)
        invoices = self.formatInvoices(invoices)
        # the time each line was entered, beside its date
        stampEntered(ledgers, StaffLedger)
        stampEntered(invoices, StaffInvoice)
        data = list(itertools.chain(ledgers, invoices))
        # print(data)
        data = sorted(data, key=lambda item: item["date"])
        return data

    def formatLedgers(self, ledgers: list):
        data = []
        for ledger in ledgers:
            pars = []
            total_amount = ledger.pop("total", 0)
            ledger["debit_amount"] = total_amount
            details = ledger.pop("details", {})
            for title, amount in details.items():
                pars.append([TITLE_LABELS.get(title, title), amount])
            if not pars:
                pars = [["salary", total_amount]]
            if CARRY_FORWARD_OUT in details:
                # The balance leaving a closed year belongs on the credit
                # side, beside the payments: it is what brings the year to
                # zero. The page puts a line carrying `tds_amount` there and
                # offers neither a reprint nor a delete for it, which is right
                # for this line too.
                ledger.pop("debit_amount")
                ledger["tds_amount"] = -total_amount
                pars = [[TITLE_LABELS[CARRY_FORWARD_OUT], -total_amount]]
            ledger["particulars"] = pars
            data.append(ledger)
        return data

    def formatInvoices(self, invoices: list):
        data = []
        for inv in invoices:
            pars = []
            total_amount = inv.pop("total_paid", 0)
            inv["credit_amount"] = total_amount
            month = inv.pop("payment_month")
            inv["months"] = [month]
            details = inv.pop("details", {})
            for title, title_details in details.items():
                amount = title_details.pop(INVOICE_DETAILS["AMOUNT"], 0)
                tdsa = title_details.pop(INVOICE_DETAILS["TAX_AMOUNT"], 0)
                amount -= tdsa
                pars.append([TITLE_LABELS.get(title, title), amount])
            if not pars:
                pars = [["salary", total_amount]]
            inv["particulars"] = pars
            data.append(inv)
            # withholdings (tds, pf, insurance) settle the salary liability too,
            # so each becomes its own line on the statement
            for label, key in (
                ("TDS", "total_deduction"),
                ("PF", "pf_deduction"),
                ("Insurance", "insurance_deduction"),
            ):
                deduction_inv = self.deductionInvoice(inv, label, key)
                if deduction_inv:
                    data.append(deduction_inv)
        return data

    def deductionInvoice(self, invoice, label, key):
        amount = invoice.pop(key, 0) or 0
        if amount:
            data = {**invoice}
            invoice_id = data.get("invoice_id")
            data.pop("credit_amount", None)
            data["particulars"] = [[f"{label} on Invoice {invoice_id}", amount]]
            data["tds_amount"] = amount
            return data

    def getTransactions(self, school_id: int, date: list, request) -> list:
        RETURN_FIELDS = (
            "id",
            "date",
            "staff__id",
            "staff__first_name",
            "staff__middle_name",
            "staff__last_name",
            "details",
            "payment_month",
            "total_paid",
        )
        #
        transactions_query = Q(
            school__id=school_id,
            is_active=True,
        )
        #
        if date:
            # print('APPLYING DATE : ', date)
            transactions_query &= Q(date__range=date)
        transactions_query = StaffInvoice.objects.filter(transactions_query).values(
            *RETURN_FIELDS
        )
        #
        paginator = InvoiceCursorPagination()
        transactions = paginator.paginate_queryset(transactions_query, request)
        s = StaffInvoiceSerializer(transactions, many=True)
        data = self.formatTransactions(s.data) or s.data
        return paginator.get_paginated_response(data)

    def formatTransactions(self, transactions):
        data = []
        for e in transactions:
            data.append(
                {
                    "id": e.get("id"),
                    "date": e.get("date"),
                    "staff_id": e.get("staff__id") or "",
                    "staff_name": (
                        " ".join(
                            [
                                e.get(f"staff__{field}_name") or ""
                                for field in ["first", "middle", "last"]
                            ]
                        )
                    ),
                    "amount": e.get("total_paid") or 0,
                    "month": e.get("payment_month") or "",
                    # what the slip paid, so a payment of old dues can be
                    # told from a month's salary without opening it
                    "paid_for": [
                        TITLE_LABELS.get(title, title)
                        for title in (e.get("details") or {"salary": None})
                    ],
                }
            )
        return data

    def put(self, request):
        return self._delete(request)

    def _delete(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        delete_reason = request.data.get("remarks")
        updated_at = timezone.now()
        if id and school_id:
            item = StaffInvoice.objects.get(id=id, school=school_id)
            if item:
                closed = closedPayrollMessage(item.school_id, item.economic_year_id)
                if closed:
                    return Response(
                        {"message": closed}, status=status.HTTP_400_BAD_REQUEST
                    )
                item.is_active = False
                item.updated_at = updated_at
                if delete_reason:
                    item.remarks = delete_reason
                item.save()
                return Response({"message": "Invoice deleted!"})
        return self.RESPONSE__INVALID_REQUEST
