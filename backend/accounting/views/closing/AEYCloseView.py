from django.db.models import Q
from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

#
from rest_framework.response import Response
from rest_framework import status

#
from account.auth.Authentication import AdminTokenAuthentication

#
from main.views.BaseViews import SecuredAPIView
from main.methods.getDateRange import getDateRange
from main.methods.nepaliDatetime import resolve_fiscal_year_end
from main.methods.payrollClose import closePayrollForAccountingYear, closeSummary
from ...models.AccountingEconomicYear import AccountingEconomicYear
from ...models.AccountingLedger import AccountingLedger, AccountingLedgerBalance
from ..AccountingLedgerView import AccountingLedgerBalanceQueryMixin
from ...methods.closingBalances import getAllMovements, calculateClosingBalances


class AEYCloseView(SecuredAPIView, AccountingLedgerBalanceQueryMixin):
    authentication_classes = (AdminTokenAuthentication,)

    def post(self, request):
        """
        1. get current opening balances.
        2. create new economic year
        3. get all particulars within current EY for all 3 types of entries.
        4. income/expense: find those with invalid entries i.e. old entries [return/continue]
        5. Closing Logic
            - Income & Expenses: sum and pass to retained earning ledger (set ledgers to 0)
            - Others : sum and pass to their own ledgers
        6. close old economic year.
        7. close the payroll of that year, carrying what the staff are still
           owed into the next one (main/methods/payrollClose.py).
        """
        school_id = request.data.get("school")
        if school_id:
            acc_ey_id = request.data.get("id")
            start_date = request.data.get("start_date")
            end_date = request.data.get("end_date")
            new_acc_ey: dict = request.data.get("new_accounting_economic_year")
            retained_earning_ledger_id = request.data.get(
                "selected_retained_earning_ledger"
            )
            check_invalids = request.data.get("check_invalids") or True
            check_invalids = self.getBooleanValue(check_invalids)
            #
            # the year must be the requesting school's own: by id alone, any
            # admin could close — and freeze — another school's books
            closing_ey = AccountingEconomicYear.objects.filter(
                id=acc_ey_id, school=school_id, closed=False
            ).first()
            if not closing_ey:
                return self.RESPONSE__INVALID_REQUEST
            #
            # The year's OWN dates decide what belongs to it -- never the dates
            # the screen happened to send. Great Araniko closed FY 2082/083
            # (which runs to 2083-03-32) with an end of 2083-03-31, so every
            # voucher dated on the year's real last day was left out of the
            # closing-balance math: 14 vouchers, Rs 34.7 lakh, and Chaitra 32 is
            # exactly where an accountant posts year-end settlements. Eight
            # settled parties carried forward as still owing (Rs 12.34 lakh),
            # cash carried 77,445 instead of 0, and Retained Earning came out on
            # the wrong side. A closing balance is a fact about the year, so it
            # is computed from the year.
            start_date = closing_ey.start_date or start_date
            end_date = closing_ey.end_date or end_date
            date_range = getDateRange(start_date, end_date)
            q = Q(
                entry__is_active=True,
                entry__school=school_id,
                entry__economic_year=acc_ey_id,
                entry__date__range=date_range,
            )
            #
            strict = True
            try:
                with transaction.atomic():
                    """1
                    - ledgers with opening balances for school_id and running economic year.
                    """
                    _ob_fields = (
                        "id",
                        "ledger_group",
                        "opening_balance",
                        "balance_type",
                    )
                    ledgers = AccountingLedger.objects.filter(
                        is_active=True, school=school_id
                    )
                    ledgers = self.getOpeningBalances(
                        ledgers,
                        acc_ey_id,
                        include_economic_year_date=False,
                        strict=False,
                    ).values(*_ob_fields)
                    """2
                    - create new accounting economic year
                    """
                    # The year being created here is the one the NEXT close
                    # will compute its balances from, so a short end date does
                    # not just hide a day of reports -- it arms this same bug
                    # again twelve months out. Rapti Bal's close wrote a year
                    # ending 2084-03-31 when Ashad 2084 runs to 32.
                    if isinstance(new_acc_ey, dict):
                        new_acc_ey["end_date"] = resolve_fiscal_year_end(
                            new_acc_ey.get("start_date"), new_acc_ey.get("end_date")
                        )
                    new_acc_ey_obj = AccountingEconomicYear.objects.create(
                        school_id=school_id,
                        previous_ey_id=acc_ey_id,
                        **new_acc_ey,
                    )
                    new_acc_ey_id = new_acc_ey_obj.id
                    """3, 4
                    - net (debit - credit) movement per ledger across all entry types
                    - calculate closing balances; using opening-balances and movements.
                    """
                    movements = getAllMovements(q, strict)
                    closing_balances = calculateClosingBalances(
                        ledgers,
                        movements,
                        retained_earning_ledger_id,
                    )
                    """5
                    - create opening-balances with new accounting economic year id.
                    """
                    AccountingLedgerBalance.objects.bulk_create(
                        [
                            AccountingLedgerBalance(
                                economic_year_id=new_acc_ey_id, **cb
                            )
                            for cb in closing_balances
                        ]
                    )
                    """6
                    - close old economic year
                    """
                    updated_at = timezone.now()
                    AccountingEconomicYear.objects.filter(id=acc_ey_id).update(
                        closed=True,
                        updated_at=updated_at,
                    )
                    """7
                    - the payroll of the year goes with it. Inside this
                      transaction: the books and the payroll close together or
                      not at all.
                    """
                    payroll_closed, payroll_skipped = closePayrollForAccountingYear(
                        school_id, closing_ey
                    )
                    #
                    # transaction.set_rollback(True)
                    # print("SUCCEED!")
                message = "Accounting economic year closed"
                for close in payroll_closed:
                    message += (
                        f". Payroll {close.economic_year.name} closed with it: "
                        f"Rs {close.total_carried:,.2f} for {close.staff_count} staff "
                        f"carried into {close.next_economic_year.name} as old dues"
                    )
                for year, reason in payroll_skipped:
                    message += f". Payroll {year.name} was NOT closed: {reason}"
                return Response(
                    {
                        "message": message,
                        "payroll": [closeSummary(close) for close in payroll_closed],
                    }
                )
            except (ValidationError, Exception) as e:
                if isinstance(e, ValidationError):
                    msg = e.message_dict if hasattr(e, "message_dict") else e.messages
                else:
                    msg = str(e)
                return Response({"message": msg}, status=status.HTTP_400_BAD_REQUEST)
        return self.RESPONSE__INVALID_REQUEST

