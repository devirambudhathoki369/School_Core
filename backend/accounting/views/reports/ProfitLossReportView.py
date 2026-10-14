from django.db.models import Q

#
from rest_framework.response import Response
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from main.methods.getDateRange import getDateRange
from main.views.BaseViews import SecuredAPIView
from .AccountingLedgerReportView import LedgerEntriesSearchMixin

from ...methods.profitLoss import (
    INCOME_LEDGER_GROUPS as _INCOME_LEDGER_GROUPS,
    EXPENSE_LEDGER_GROUPS as _EXPENSE_LEDGER_GROUPS,
    signed_amount,
)

_TWO_PLACES = Decimal("0.01")


def _money(value):
    """Round a Decimal to 2 places and return it as a JSON-clean float."""
    return float(Decimal(value).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP))


class ProfitLossReportView(SecuredAPIView, LedgerEntriesSearchMixin):
    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    MAJOR_LEDGER_GROUPS = (
        *_INCOME_LEDGER_GROUPS,
        *_EXPENSE_LEDGER_GROUPS,
    )  # From /accounting/create_ledger/index.jsx > LEDGER_GROUPS_OPTIONS (group: Income & Expense)

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")  # accounting economic year
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if school_id and ecoy_id and start_date and end_date:
            date_range = getDateRange(start_date, end_date)
            q = Q(
                entry__is_active=True,
                entry__school=school_id,
                entry__economic_year=ecoy_id,
                entry__date__range=date_range,
            )
            #
            particulars = self.getLedgers(
                q,
                None,
                self.MAJOR_LEDGER_GROUPS,
            )
            report = self.prepareReport(
                particulars
            )  # {particulars:{}, totals:{}, ledgers:{}, ledger_groups:{}}
            return Response(report)
        return self.RESPONSE__INVALID_REQUEST

    def prepareReport(self, particulars):
        # Aggregate in Decimal (not float) so summing many 2-decimal amounts can't
        # drift into artifacts like 436299.20999999996; every emitted value is then
        # quantized back to 2 decimals for a clean response.
        data = defaultdict(lambda: defaultdict(Decimal))
        ledgers = {}
        income_total = Decimal("0")
        expense_total = Decimal("0")

        for par in particulars:
            group_id = par.get("ledger_group")
            ledger_id = par.get("ledger")
            # signed, NOT raw: a journal posting against the group's natural
            # side is a correction and has to come off the total. Adding it
            # moved every corrected figure by twice the correction.
            amount = signed_amount(par)
            if amount is None:
                continue
            data[group_id][ledger_id] += amount
            if ledger_id not in ledgers:
                ledgers[ledger_id] = par.get("ledger_str", "")

        totals = {}
        for ledger_group_id, ledgers_group_data in data.items():
            group_total = sum(ledgers_group_data.values(), Decimal("0"))
            totals[ledger_group_id] = _money(group_total)
            # the income tuple, not a second hardcoded list: the copy that
            # used to live here read [11, 15] and so dropped Sales (21) into
            # the expense side, subtracting every sale instead of adding it.
            if ledger_group_id in _INCOME_LEDGER_GROUPS:
                income_total += group_total
            else:
                expense_total += group_total
        totals["income"] = _money(income_total)
        totals["expense"] = _money(expense_total)
        totals["net_profit_loss"] = _money(income_total - expense_total)

        particulars_out = {
            group_id: {
                ledger_id: _money(amount) for ledger_id, amount in group_data.items()
            }
            for group_id, group_data in data.items()
        }

        return {
            "particulars": particulars_out,
            "totals": totals,
            "ledgers": ledgers,
            "ledger_groups": {
                "income": _INCOME_LEDGER_GROUPS,
                "expense": _EXPENSE_LEDGER_GROUPS,
            },
        }
