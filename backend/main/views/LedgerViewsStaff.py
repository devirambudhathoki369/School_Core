from django.db.models import Q, F

#
from rest_framework.response import Response
from rest_framework import status
from itertools import chain
from django.utils import timezone

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from .BaseViews import SecuredAPIView
from ..models.Staff import Staff
from ..models.Ledger import StaffLedger
from ..models.Invoice import StaffInvoice
from ..serializers.LedgerSerializer import StaffLedgerSerializer
from ..constants.payment import OPENING_BALANCE

# ALL_TITLES lives in constants/payroll.py; it is imported from here by name
# elsewhere, so it stays importable from here.
from ..constants.payroll import ALL_TITLES, CARRY_TITLES
from ..methods.payrollClose import titleBalances, closedPayrollMessage


class StaffLedgerView(SecuredAPIView):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)

    def prepareData(self, data):
        school = data.pop("school", None)
        acay = data.pop("academic_year", None)
        ecoy = data.pop("economic_year", None)
        date = data.pop("date", None)
        months = data.pop("months", None) or []
        # One staff member posted from their profile's Ledger tab. The month is
        # optional there -- a bonus or an advance belongs to no salary period --
        # whereas Salary posting always bills a period.
        single_staff = bool(data.pop("single_staff", False))
        if school and acay and ecoy and date and (months or single_staff):
            preparedData = []
            ledgers = data.pop("ledgers", [])
            for led in ledgers:
                preparedData.append(
                    {
                        "academic_year": acay,
                        "economic_year": ecoy,
                        "date": date,
                        "months": months,
                        "school": school,
                        **led,
                        "single_staff": single_staff,
                    }
                )
            return preparedData
        return None

    def post(self, request):
        # A closed payroll year takes no more postings: its balances have
        # already been carried into the next year.
        closed = closedPayrollMessage(
            request.data.get("school"), request.data.get("economic_year")
        )
        if closed:
            return Response({"message": closed}, status=status.HTTP_400_BAD_REQUEST)
        data = self.prepareData(request.data)
        # Every balance reader indexes by ALL_TITLES; a stray key would 500 the
        # staff's ledger and the payment screen from then on.
        if data and any(
            title not in ALL_TITLES
            for led in data
            for title in (led.get("details") or {})
        ):
            return self.RESPONSE__INVALID_REQUEST
        if data:
            s = StaffLedgerSerializer(data=data, many=True)
            if s.is_valid():
                s.save()
                return Response({"message": "Salary posted!"})
        return self.RESPONSE__INVALID_REQUEST

    def get(self, request):
        school_id = request.query_params.get("school")
        RETURN_FIELDS = (
            "id",
            "date",
            "total",
        )
        if school_id:
            q = Q(school=school_id, is_active=True)
            staff_id = request.query_params.get("staff")
            months = request.query_params.get("months") or False
            acay = request.query_params.get("academic_year")
            ecoy = request.query_params.get("economic_year")
            if staff_id:
                q &= Q(staff=staff_id)
            elif months:
                # The school-wide "already posted" months drive Salary posting's
                # month blocking; one staff member's catch-up entry must not
                # lock a month for everybody else.
                q &= Q(single_staff=False)
            #
            if months and acay and ecoy:
                q &= Q(academic_year=acay, economic_year=ecoy)
                ledgers = StaffLedger.objects.filter(q).values(*RETURN_FIELDS)
                # Each posted period as it was posted ("Kartik, Mangsir, Poush"),
                # first posting date kept -- the staff Ledger tab offers these the
                # way the student tab offers a class's posted groups.
                groups = {}
                for row in ledgers.order_by("date", "id").values("months", "date"):
                    ms = sorted(row["months"] or [])
                    if ms:
                        groups.setdefault(tuple(ms), {"months": ms, "date": row["date"]})
                months = ledgers.values_list("months", flat=True).distinct()
                if months:
                    months = set(chain.from_iterable(months))
                return Response({"months": months, "groups": list(groups.values())})
            else:
                """bill-title-selection.jsx
                #payroll.staff
                """
                data = self.mergeStaffLedgers(staff_id, school_id, ecoy)
                return Response(data)
        return self.RESPONSE__INVALID_REQUEST

    def mergeStaffLedgers(self, staff_id: int, school_id: int, ecoy: int):
        finance_details = self.getStaffFinanceDetails(staff_id, school_id)
        if finance_details:
            q = Q(school=school_id, is_active=True, staff=staff_id, economic_year=ecoy)
            ledgers = (
                StaffLedger.objects.filter(q).values("details", "total").order_by("id")
            )
            invoices = (
                StaffInvoice.objects.filter(q)
                .values(
                    "details",
                    "total_paid",
                    "total_deduction",
                    "pf_deduction",
                    "insurance_deduction",
                )
                .order_by("id")
            )
            mergedLedgers, total = self.calculateStaffLedger(ledgers, invoices)
            return {
                "bill_amount": self.orderTitles(mergedLedgers),
                "total": total,
            }
        return {}

    def orderTitles(self, balance):
        """Old dues first, then the earning titles in their usual order.

        An earning title is listed even at zero, as it always was. A carried
        line is listed only while something is left on it: a year nothing was
        carried into shows no "old dues" row at all.
        """
        ordered = {}
        if balance.get(OPENING_BALANCE):
            ordered[OPENING_BALANCE] = balance[OPENING_BALANCE]
        for title, amount in balance.items():
            if title not in CARRY_TITLES:
                ordered[title] = amount
        for title in CARRY_TITLES:
            if title != OPENING_BALANCE and balance.get(title):
                ordered[title] = balance[title]
        return ordered

    def getStaffFinanceDetails(self, staff_id, school_id):
        staff = Staff.objects.filter(id=staff_id, school=school_id, is_active=True)
        if staff:
            staff = staff.annotate(
                salary=F("other_info__basic_salary"),
                funds=F("other_info__funds"),
                grade=F("other_info__grade"),
                allowance=F("other_info__allowance"),
                extra=F("other_info__extra"),
                insurance=F("other_info__insurance"),
                pf_contrib=F("other_info__pf_contrib"),
            ).values(
                "salary",
                "funds",
                "grade",
                "allowance",
                "extra",
                "insurance",
                "pf_contrib",
            )
            return staff[0]
        return None

    def calculateStaffLedger(self, ledgers, invoices):
        # The same sum a year-close carries forward (methods/payrollClose.py):
        # one implementation, so the screen and the close cannot disagree.
        balance = titleBalances(ledgers, invoices)
        return balance, sum(balance.values())

    def put(self, request):
        return self._delete(request)

    def _delete(self, request):
        id = request.data.get("id")
        school_id = request.data.get("school")
        delete_reason = request.data.get("remarks")
        updated_at = timezone.now()
        if id and school_id:
            item = StaffLedger.objects.get(id=id, school=school_id)
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
                return Response({"message": "Ledger deleted!"})
        return self.RESPONSE__INVALID_REQUEST
