from django.db.models import Q

#
from rest_framework.response import Response
from collections import defaultdict

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)

#
from main.views.BaseViews import SecuredAPIView
from main.methods.getDateRange import getDateRange

#
from ...models.AccountingLedger import AccountingLedger
from .AccountingLedgerReportView import (
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
)
from ...constants.ledger_groups import LEDGER_GROUPS_OPTIONS


class TrialBalanceView(
    SecuredAPIView,
    LedgerEntriesSearchMixin,
    AccountingLedgerBalanceQueryMixin,
):
    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)
    DETAILED = False
    DEBIT, CREDIT = 1, 2

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")
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
            particulars = self.getLedgers(q, None, None)
            tb = self.prepareTrialBalance(school_id, ecoy_id, particulars)
            return Response(tb)
        return self.RESPONSE__INVALID_REQUEST

    def prepareTrialBalance(self, school_id, accounting_economic_year_id, particulars):
        groups = {e.value: e.name for e in LEDGER_GROUPS_OPTIONS}
        #
        acq = Q(is_active=True, school=school_id)
        acc_ledgers = AccountingLedger.objects.filter(acq)
        acc_ledgers = self.getOpeningBalances(acc_ledgers, accounting_economic_year_id)
        opening_balances = {
            ob["id"]: ob
            for ob in acc_ledgers.values(
                "id", "name", "ledger_group", "balance_type", "opening_balance"
            )
        }

        data = defaultdict(
            lambda: {
                "group": "",
                "group_opening_debit": 0,
                "group_opening_credit": 0,
                "group_debit": 0,
                "group_credit": 0,
                "group_closing_debit": 0,
                "group_closing_credit": 0,
                "ledgers": defaultdict(
                    lambda: {
                        "id": None,
                        "ledger": "",
                        "opening_debit": 0,
                        "opening_credit": 0,
                        "debit": 0,  # vouchers
                        "credit": 0,
                        "closing_debit": 0,
                        "closing_credit": 0,
                    }
                ),
            }
        )
        totals = {
            "opening_debit": 0,
            "opening_credit": 0,
            "closing_debit": 0,
            "closing_credit": 0,
        }

        def getLedgerRow(lid, group, name):
            """
            Row for a ledger, seeding its opening balance the first time it is
            touched -- whether it was reached via a posting or via its opening
            balance alone.
            """
            group_block = data[group]
            group_block["group"] = groups.get(group, "-")
            ledger_row = group_block["ledgers"][lid]
            if ledger_row["id"] is not None:
                return group_block, ledger_row
            ledger_row["id"] = lid
            ledger_row["ledger"] = name
            ob = opening_balances.get(lid)
            if ob:
                ob_amt = ob["opening_balance"]
                side = "debit" if ob["balance_type"] == self.DEBIT else "credit"
                ledger_row[f"opening_{side}"] = ob_amt
                group_block[f"group_opening_{side}"] += ob_amt
                totals[f"opening_{side}"] += ob_amt
            return group_block, ledger_row

        # a ledger carrying an opening balance belongs in the trial balance even
        # with no postings in the period -- otherwise a freshly opened year
        # reports nothing at all, and dormant ledgers silently drop out.
        for lid, ob in opening_balances.items():
            getLedgerRow(lid, ob["ledger_group"], ob["name"])

        total_debit, total_credit = 0, 0  # vouchers
        for e in particulars:
            lid = e["ledger"]
            group = e["ledger_group"]
            name = e["ledger_str"]
            amount = e["amount"]
            type = e["type"]

            group_block, ledger_row = getLedgerRow(lid, group, name)

            if type == self.DEBIT:
                total_debit += amount
                ledger_row["debit"] += amount
                group_block["group_debit"] += amount
            else:
                total_credit += amount
                ledger_row["credit"] += amount
                group_block["group_credit"] += amount

        # A CLOSING BALANCE IS A NET, NOT A RUNNING TOTAL OF BOTH COLUMNS.
        #
        # Closing used to be accumulated as opening_debit + debits on one side
        # and opening_credit + credits on the other, so every ledger reported
        # its full turnover twice over and nothing ever closed to zero. Rapti
        # Bal's Cash In Hand took 17,530,604.00 in and paid 17,530,604.00 out
        # and closed at 17,530,604.00 on BOTH sides instead of nil; Sundry
        # Creditors did the same at 4,214,300.00.
        #
        # A ledger has ONE balance. Net it -- opening credit plus credits, less
        # opening debit and debits -- and let the sign choose the column. The
        # net is taken per LEDGER and only then summed into the group and the
        # grand total, because a group holding one debtor and one creditor
        # genuinely owns a figure in each column; netting the group as a whole
        # would cancel two unrelated parties against each other.
        for group_block in data.values():
            for ledger_row in group_block["ledgers"].values():
                net_credit = (ledger_row["opening_credit"] + ledger_row["credit"]) - (
                    ledger_row["opening_debit"] + ledger_row["debit"]
                )
                ledger_row["closing_debit"] = -net_credit if net_credit < 0 else 0
                ledger_row["closing_credit"] = net_credit if net_credit > 0 else 0
                #
                group_block["group_closing_debit"] += ledger_row["closing_debit"]
                group_block["group_closing_credit"] += ledger_row["closing_credit"]
                totals["closing_debit"] += ledger_row["closing_debit"]
                totals["closing_credit"] += ledger_row["closing_credit"]
        #
        data = [
            {
                "group": grp["group"],
                "group_opening_debit": grp["group_opening_debit"],
                "group_opening_credit": grp["group_opening_credit"],
                "group_debit": grp["group_debit"],
                "group_credit": grp["group_credit"],
                "group_closing_debit": grp["group_closing_debit"],
                "group_closing_credit": grp["group_closing_credit"],
                "ledgers": grp["ledgers"].values(),
            }
            for grp in data.values()
        ]

        return {
            "data": data,
            "total_opening_debit": totals["opening_debit"],
            "total_opening_credit": totals["opening_credit"],
            "total_debit": total_debit,
            "total_credit": total_credit,
            "total_closing_debit": totals["closing_debit"],
            "total_closing_credit": totals["closing_credit"],
        }
