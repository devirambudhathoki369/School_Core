from django.db.models import Q
from rest_framework.response import Response
from rest_framework.status import HTTP_400_BAD_REQUEST
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from collections import defaultdict
from decimal import Decimal

#
from main.views.BaseViews import SecuredAPIView
from main.methods.getDateRange import getDateRange
from .AccountingLedgerReportView import (
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
)
from ...models.AccountingLedger import AccountingLedger
from ...models.AccountingEconomicYear import AccountingEconomicYear
from ...methods.profitLoss import (
    PROFIT_LOSS_LEDGER_GROUPS,
    split_income_expense,
)

# Every group in the category, with nothing commented out.
#
# 4, 28 and 30 used to be excluded here as "not confirmed!". A balance sheet
# that silently drops a ledger group is the one report that must never do it:
# whatever sits in an omitted group goes missing from the totals, and the sheet
# is then out by exactly that amount with nothing on its face to say why. That
# is not hypothetical -- school 51's 441,314.00 balancing entry was booked to a
# Suspense A/C (group 28) and promptly vanished from this report.
#
# Each one goes to the category the shared constants already declare for it, so
# there is a single source of truth for where a group belongs.
_LIABILITIES_LEDGER_GROUPS = (
    1,  # Account Payable
    4,  # Bank Occ Account
    5,  # Bank OD Account
    9,  # Current Liabilities
    18,  # Loans
    19,  # Provision
    26,  # Sundry Creditors
    28,  # Suspense A/C
    29,  # Unsecured Loan
    31,  # Secured Loan
    33,  # Short Term Loan
)
_EQUITIES_LEDGER_GROUPS = (
    6,  # Capital A/C
    23,  # Reserve and surplus
    24,  # Retained Earning
    32,  # Bonus Share
    34,  # Share Capital
)
_ASSETS_LEDGER_GROUPS = (
    2,  # Account Receivable
    3,  # Bank Account
    7,  # Cash in Hand
    8,  # Current Assets
    13,  # Fix Assets
    16,  # Investment
    17,  # Loan and Advance
    25,  # Stock in Hand (closing stock)
    27,  # Sundry Debtors
    30,  # Stock in Hand (opening stock)
)


class BalanceSheetReportView(
    SecuredAPIView,
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    MAJOR_LEDGER_GROUPS = (
        *_LIABILITIES_LEDGER_GROUPS,
        *_EQUITIES_LEDGER_GROUPS,
        *_ASSETS_LEDGER_GROUPS,
    )
    DETAILED = False

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")  # accounting economic year
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if school_id and ecoy_id and start_date and end_date:
            # A BALANCE SHEET IS AS-AT A DATE, NOT OVER A RANGE.
            #
            # Assets and liabilities are cumulative: what the school owns and
            # owes on `end_date`. The opening balances loaded below are the
            # ones for the WHOLE year, so honouring a later `start_date` kept
            # the full opening figure while silently dropping every movement
            # before it -- Rapti Bal's total assets moved 38,541,656.52 ->
            # 36,089,321.52 just by changing the From box, and neither number
            # was a balance sheet. The period therefore always begins where the
            # fiscal year does; only the as-at date is the caller's to choose.
            year = (
                AccountingEconomicYear.objects.filter(id=ecoy_id)
                .values("name", "start_date")
                .first()
            ) or {}
            year_name = year.get("name")
            period_start = year.get("start_date") or start_date
            # An as-at date BEFORE the year even opened has no sheet to show.
            # getDateRange would raise a bare "Invalid date" here, which reads
            # as a bug in the report rather than a date the caller cannot ask
            # for, so say which date is the problem.
            if str(end_date) < str(period_start):
                return Response(
                    {
                        "message": f"{year_name or 'This fiscal year'} opens on "
                        f"{period_start}. Choose an as-at date on or after it."
                    },
                    status=HTTP_400_BAD_REQUEST,
                )
            date_range = getDateRange(period_start, end_date)
            q = Q(
                entry__is_active=True,
                entry__school=school_id,
                entry__economic_year=ecoy_id,
                entry__date__range=date_range,
            )
            particulars = self.getLedgers(
                q,
                None,
                self.MAJOR_LEDGER_GROUPS,
            )
            # The same window, over the income & expense groups the balance
            # sheet itself never shows. Its result is what closes the sheet.
            ie_particulars = self.getLedgers(
                q,
                None,
                PROFIT_LOSS_LEDGER_GROUPS,
            )
            #
            acq = Q(is_active=True, school=school_id)
            acq &= Q(ledger_group__in=self.MAJOR_LEDGER_GROUPS)
            acc_ledgers = AccountingLedger.objects.filter(acq)
            acc_ledgers = self.getOpeningBalances(acc_ledgers, ecoy_id)
            balances = acc_ledgers.values(
                "id", "name", "ledger_group", "balance_type", "opening_balance"
            )
            #
            report = self.prepareReport(
                particulars, balances, ie_particulars, year_name
            )
            return Response(report)
        return self.RESPONSE__INVALID_REQUEST

    DEBIT = 1
    CREDIT = 2

    def prepareReport(self, particulars, balances, ie_particulars=(), year_name=None):
        ledgers = {}
        totals = {"liabilities": 0, "equities": 0, "assets": 0}
        #
        data = defaultdict(lambda: defaultdict(Decimal))
        # `balances` is a queryset; accumulate the opening Dr-Cr gap HERE rather
        # than iterating it a second time later and paying for the query twice.
        opening_gap = Decimal("0")
        for opening_blc in balances:
            ledger_id = opening_blc.get("id")
            group_id = opening_blc.get("ledger_group")
            balance_type = opening_blc.get("balance_type")
            amount = opening_blc.get("opening_balance") or 0
            amount = -amount if balance_type == self.CREDIT else amount
            data[group_id][ledger_id] = Decimal(amount)
            opening_gap += Decimal(amount)
            ledgers[ledger_id] = opening_blc.get("name", "-")
        # calculations
        for par in particulars:
            group_id = par.get("ledger_group")
            ledger_id = par.get("ledger")
            try:
                amount = Decimal(par.get("amount") or "0")
            except Exception as e:
                continue

            _type = par.get("type")
            if _type == self.CREDIT:
                data[group_id][ledger_id] -= amount
            else:
                data[group_id][ledger_id] += amount
            ledgers[ledger_id] = par.get("ledger_str", "-")
        # summary
        for ledger_group_id, ledgers_group_data in data.items():
            totals[ledger_group_id] = sum(ledgers_group_data.values())
            if ledger_group_id in _LIABILITIES_LEDGER_GROUPS:
                totals["liabilities"] += totals[ledger_group_id]
            elif ledger_group_id in _EQUITIES_LEDGER_GROUPS:
                totals["equities"] += totals[ledger_group_id]
            else:
                totals["assets"] += totals[ledger_group_id]
        # THE YEAR'S RESULT.
        #
        # This was `net_profit_loss = 0` with a TODO against it, and a name
        # carrying a literal "<FY>" that no f-string ever filled. A balance
        # sheet missing the year's profit cannot balance -- the two sides
        # differed by exactly the profit, every time, for every school.
        #
        # Signing: `totals` here is debit-positive (assets +, liabilities and
        # equity -), so a PROFIT is a credit to equity and enters negative.
        # `amount` carries that same signed figure, so a loss reads as a
        # negative on the equity side instead of silently looking like a gain.
        income, expense = split_income_expense(ie_particulars)
        net_profit_loss = income - expense  # + profit, - loss
        totals["equities"] += -net_profit_loss
        profit_loss = {
            "name": "{} for {}".format(
                "Profit" if net_profit_loss >= 0 else "Loss",
                year_name or "the period",
            ),
            "amount": -net_profit_loss,
        }
        # WHY THE TWO SIDES DISAGREE, ON THE FACE OF THE REPORT.
        #
        # A sheet that simply prints two unequal totals and says nothing reads
        # as "the software is broken" -- which is exactly how this one was
        # reported. The two sides can only differ for two reasons, and the
        # report now names which:
        #
        #   opening -- the hand-keyed opening balances do not tie (Dr != Cr).
        #              True of 18 of the 31 live accounting years.
        #   vouchers -- the postings themselves do not tie. Double entry makes
        #              this 0.00 almost everywhere; where it is not, a voucher
        #              was saved one-sided.
        #
        # gap == opening + vouchers, exactly, and both are the SCHOOL's data to
        # correct. Deliberately NOT plugged into a balancing row: an invented
        # figure that makes the totals agree buries a real hole.
        voucher_gap = sum(
            (
                Decimal(par.get("amount") or 0)
                * (-1 if par.get("type") == self.CREDIT else 1)
            )
            for par in (*particulars, *ie_particulars)
        )
        return {
            "particulars": data,
            "totals": totals,
            "ledgers": ledgers,
            "profit_loss": profit_loss,
            "net_profit_loss": net_profit_loss,
            "difference": {
                "amount": totals["assets"] + totals["liabilities"] + totals["equities"],
                "opening": opening_gap,
                "vouchers": voucher_gap,
            },
        }
