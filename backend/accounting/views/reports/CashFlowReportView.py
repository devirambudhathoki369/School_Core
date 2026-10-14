from django.db.models import Q
from rest_framework.response import Response
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.methods.getDateRange import getDateRange
from main.views.BaseViews import SecuredAPIView

#
from .AccountingLedgerReportView import LedgerEntriesSearchMixin
from ..AccountingLedgerView import AccountingLedgerBalanceQueryMixin
from ...models.AccountingLedger import AccountingLedger
from ...constants.ledger_groups import (
    LEDGER_GROUPS_OPTIONS,
    LEDGER_GROUP_CATEGORIES,
    CASH_FLOW_CATEGORIES,
)

DEBIT = 1
CREDIT = 2
CASH_BANK_GROUPS = (3, 7)  # 3: Bank Account, 7: Cash in Hand (the cash equivalents)
_ALL_GROUP_IDS = tuple(opt.value for opt in LEDGER_GROUPS_OPTIONS)

# group_id -> cash-flow category value (1 operating, 2 investing, 3 financing).
# The accounting constants already classify every ledger group; cash/bank and a
# couple of unclassified groups have flow=None.
_GROUP_FLOW = {opt.value: (opt.flow.value if opt.flow else None) for opt in LEDGER_GROUPS_OPTIONS}
_GROUP_CATEGORY = {opt.value: opt.group.value for opt in LEDGER_GROUPS_OPTIONS}

_INCOME_ID = LEDGER_GROUP_CATEGORIES["INCOME"].value
_EXPENSE_ID = LEDGER_GROUP_CATEGORIES["EXPENSE"].value
_OPERATING = CASH_FLOW_CATEGORIES["OPERATING"].value
_INVESTING = CASH_FLOW_CATEGORIES["INVESTING"].value
_FINANCING = CASH_FLOW_CATEGORIES["FINANCING"].value

_TWO = Decimal("0.01")


def _money(value):
    return float(Decimal(value).quantize(_TWO, rounding=ROUND_HALF_UP))


class CashFlowReportView(
    SecuredAPIView,
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
):
    """
    Cash Flow Statement (indirect, derived from ledger movements).

    Every entry — including income/expense — stores *all* of its legs as
    particulars (the cash/bank header is added as a particular too; see
    BaseEntrySerializer.create). So the period movement (DR − CR) of each ledger is
    available straight from the particulars. The change in Cash-in-Hand + Bank
    accounts is the net cash flow; every non-cash ledger's movement is converted to
    its cash effect (−movement) and classified into Operating / Investing /
    Financing using the ledger-group `flow` already defined in the accounting
    constants. Because total debits equal total credits, the activity totals
    reconcile to the change in cash & bank by construction.
    """

    authentication_classes = (AdminTokenAuthentication, StaffTokenAuthentication)
    DETAILED = False

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")  # accounting economic year
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")

        if not (school_id and ecoy_id and start_date and end_date):
            return self.RESPONSE__INVALID_REQUEST

        date_range = getDateRange(start_date, end_date)
        base_q = Q(
            entry__is_active=True,
            entry__school=school_id,
            entry__economic_year=ecoy_id,
            entry__date__range=date_range,
        )

        # every particular (all legs of journal/income/expense entries) in range
        rows = self.getLedgers(base_q, None, _ALL_GROUP_IDS)

        # net period movement (DR − CR) per ledger
        movement = {}  # ledger_id -> {"name", "group", "amount": Decimal}
        for row in rows:
            gid = row.get("ledger_group")
            lid = row.get("ledger")
            try:
                amount = Decimal(row.get("amount") or "0")
            except (TypeError, InvalidOperation):
                continue
            signed = -amount if row.get("type") == CREDIT else amount
            slot = movement.get(lid)
            if slot is None:
                movement[lid] = {
                    "name": row.get("ledger_str", "-"),
                    "group": gid,
                    "amount": signed,
                }
            else:
                slot["amount"] += signed

        sections = {_OPERATING: [], _INVESTING: [], _FINANCING: []}
        other_items = []
        net_profit = Decimal("0")
        net_change = Decimal("0")  # change in cash & bank (DR − CR of those ledgers)

        for lid, slot in movement.items():
            gid = slot["group"]
            m = slot["amount"]
            if gid in CASH_BANK_GROUPS:
                # cash & bank are debit-natured assets: DR − CR == net increase.
                net_change += m
                continue
            # a non-cash ledger's cash effect is the opposite of its movement
            # (e.g. a receivable going up consumes cash).
            cash_impact = -m
            item = {"ledger": lid, "name": slot["name"], "amount": _money(cash_impact)}
            flow = _GROUP_FLOW.get(gid)
            if flow in sections:
                sections[flow].append(item)
                if _GROUP_CATEGORY.get(gid) in (_INCOME_ID, _EXPENSE_ID):
                    net_profit += cash_impact
            else:
                other_items.append(item)

        for items in (*sections.values(), other_items):
            items.sort(key=lambda i: i["name"].lower())

        def _total(items):
            return _money(sum((Decimal(str(i["amount"])) for i in items), Decimal("0")))

        # opening cash & bank balance for the economic year
        acc = AccountingLedger.objects.filter(
            is_active=True, school=school_id, ledger_group__in=CASH_BANK_GROUPS
        )
        acc = self.getOpeningBalances(acc, ecoy_id)
        opening_cash = Decimal("0")
        for b in acc.values("opening_balance", "balance_type"):
            amt = Decimal(b.get("opening_balance") or 0)
            opening_cash += -amt if b.get("balance_type") == CREDIT else amt

        net_change_f = _money(net_change)
        opening_f = _money(opening_cash)
        closing_f = _money(opening_cash + net_change)

        return Response(
            {
                "operating": {
                    "items": sections[_OPERATING],
                    "total": _total(sections[_OPERATING]),
                    "net_profit": _money(net_profit),
                },
                "investing": {
                    "items": sections[_INVESTING],
                    "total": _total(sections[_INVESTING]),
                },
                "financing": {
                    "items": sections[_FINANCING],
                    "total": _total(sections[_FINANCING]),
                },
                "other": {"items": other_items, "total": _total(other_items)},
                "net_change": net_change_f,
                "opening_cash": opening_f,
                "closing_cash": closing_f,
            }
        )
