"""
Day Book -- every voucher posted on a day, in one sheet.

The other accounting reports answer "what does this ledger/group look like over
a period". None of them answers the question an accountant asks at the end of
the day: *what did we actually post today?* This one walks the vouchers of each
date in the range, lists both sides of every one of them, and closes each date
with its own total -- the way a hand-written day book is kept.

Rows come straight from the particulars. Income and expense entries store their
cash/bank side AS the first particular (see BaseEntrySerializer.create), so a
voucher is already complete in that table and needs no synthesised counter-row.
Their Dr/Cr side is derived through IE_TYPE_CASES -- the same cases the trial
balance and the year-close use, so a day's totals cannot disagree with the
reports that summarise them.

Contra entries are left out: the rest of the accounting reports ignore them and
the entry screen is switched off, so including them here would put figures in
the day book that appear in no other report.
"""

from decimal import Decimal

#
from django.db.models import Q, F, Case, Value, IntegerField, Sum

#
from rest_framework.response import Response

#
from account.auth.Authentication import (
    AdminTokenAuthentication,
    StaffTokenAuthentication,
)
from main.views.BaseViews import SecuredAPIView
from main.methods.getDateRange import getDateRange

#
from ...models.AccountingEconomicYear import AccountingEconomicYear
from ...models.AccountingLedger import AccountingLedger
from ...models.Particulars import (
    IncomeParticular,
    ExpenseParticular,
    JournalParticular,
)
from ..AccountingLedgerView import AccountingLedgerBalanceQueryMixin
from .Entries import ENTRIES
from ...methods.ieTypes import IE_TYPE_CASES
from ...constants.ledger_groups import INCOME_ID, EXPENSE_ID

DEBIT, CREDIT = 1, 2
CASH_IN_HAND, BANK_ACCOUNT = 7, 3

# (particular model, entry type id, income/expense kind for the Dr/Cr cases)
ENTRY_SOURCES = (
    (IncomeParticular, ENTRIES.INCOME_ENTRY, INCOME_ID),
    (ExpenseParticular, ENTRIES.EXPENSE_ENTRY, EXPENSE_ID),
    (JournalParticular, ENTRIES.JOURNAL_ENTRY, None),
)

ROW_FIELDS = (
    "id",
    "entry_id",
    "ledger",
    "ledger_str",
    "ledger_group",
    "type",
    "amount",
    "remarks",
    "date",
    "voucher_no",
    "entry_remarks",
)

ZERO = Decimal("0.00")


def money(value):
    """2-decimal float, so the client can add these up as numbers."""
    return float(Decimal(value or 0).quantize(ZERO))


class DayBookView(SecuredAPIView, AccountingLedgerBalanceQueryMixin):
    authentication_classes = (StaffTokenAuthentication, AdminTokenAuthentication)

    def post(self, request):
        school_id = request.data.get("school")
        ecoy_id = request.data.get("economic_year")
        start_date = request.data.get("start_date")
        end_date = request.data.get("end_date")
        # optional: [1] income, [2] expense, [3] journal -- empty means all
        entry_types = request.data.get("entry_types") or None

        if not (school_id and ecoy_id and start_date and end_date):
            return self.RESPONSE__INVALID_REQUEST

        date_range = getDateRange(start_date, end_date)
        base_q = Q(
            entry__is_active=True,
            entry__school=school_id,
            entry__economic_year=ecoy_id,
            entry__date__range=date_range,
        )
        rows = self.getRows(base_q, entry_types)
        # The cash/bank position is a fact about the WHOLE day. Under a voucher
        # type filter the printed rows are only part of that day, so a position
        # computed from them would not be the money in the drawer and a position
        # computed from everything would not tie to the rows above it. Neither
        # is worth printing, so a filtered day book simply doesn't carry one.
        cash_position = not entry_types
        cash, bank = (
            self.getOpeningCashAndBank(school_id, ecoy_id, start_date)
            if cash_position
            else (ZERO, ZERO)
        )
        day_book = self.prepareDayBook(rows, cash, bank)
        day_book["cash_position"] = cash_position
        return Response(day_book)

    # ---- data -------------------------------------------------------------

    def getRows(self, base_q, entry_types=None):
        rows = []
        for Model, entry_type, entry_kind in ENTRY_SOURCES:
            if entry_types and entry_type not in entry_types:
                continue
            qs = Model.objects.filter(base_q).annotate(
                date=F("entry__date"),
                voucher_no=F("entry___voucher_id"),
                entry_remarks=F("entry__remarks"),
                ledger_group=F("ledger__ledger_group"),
            )
            if entry_kind:
                # income/expense particulars carry no side of their own
                qs = qs.annotate(
                    type=Case(
                        *IE_TYPE_CASES[entry_kind],
                        default=Value(None),
                        output_field=IntegerField(),
                    )
                )
            for row in qs.values(*ROW_FIELDS):
                row["entry_type"] = entry_type
                row["voucher_id"] = f"{Model.KEY}-{row['voucher_no']}"
                rows.append(row)
        # a day book reads date by date; within a date the vouchers stay
        # grouped, and within a voucher the particulars keep the order they
        # were saved in -- which puts the cash/bank side first, as entered.
        rows.sort(key=lambda r: (r["date"], r["entry_type"], r["voucher_no"], r["id"]))
        return rows

    def getOpeningCashAndBank(self, school_id, ecoy_id, start_date):
        """
        Cash and bank in hand at the START of the range: the year's opening
        balances plus everything posted between the year's first day and the
        day before this report begins.
        """
        ledgers = AccountingLedger.objects.filter(
            is_active=True,
            school=school_id,
            ledger_group__in=(CASH_IN_HAND, BANK_ACCOUNT),
        )
        balances = self.getOpeningBalances(ledgers, ecoy_id, False, False).values(
            "ledger_group", "opening_balance", "balance_type"
        )
        cash, bank = ZERO, ZERO
        for b in balances:
            amount = b["opening_balance"] or ZERO
            if b["balance_type"] == CREDIT:
                amount = -amount
            if b["ledger_group"] == CASH_IN_HAND:
                cash += amount
            else:
                bank += amount

        year = AccountingEconomicYear.objects.filter(
            id=ecoy_id, school=school_id
        ).first()
        if not year:
            return cash, bank
        # dates are stored as zero-padded YYYY-MM-DD strings, so a plain range
        # comparison is already chronological.
        earlier_q = Q(
            entry__is_active=True,
            entry__school=school_id,
            entry__economic_year=ecoy_id,
            entry__date__gte=year.start_date,
            entry__date__lt=start_date,
            ledger__ledger_group__in=(CASH_IN_HAND, BANK_ACCOUNT),
        )
        for group, side, total in self.getCashAndBankMovement(earlier_q):
            amount = -total if side == CREDIT else total
            if group == CASH_IN_HAND:
                cash += amount
            else:
                bank += amount
        return cash, bank

    def getCashAndBankMovement(self, query):
        """(ledger group, Dr/Cr, total) -- summed in the database, since the
        rows behind an opening position are never printed."""
        movement = []
        for Model, _, entry_kind in ENTRY_SOURCES:
            qs = Model.objects.filter(query).annotate(
                ledger_group=F("ledger__ledger_group")
            )
            if entry_kind:
                qs = qs.annotate(
                    type=Case(
                        *IE_TYPE_CASES[entry_kind],
                        default=Value(None),
                        output_field=IntegerField(),
                    )
                )
            qs = qs.values("ledger_group", "type").annotate(total=Sum("amount"))
            movement.extend(
                (row["ledger_group"], row["type"], row["total"] or ZERO) for row in qs
            )
        return movement

    # ---- shaping ----------------------------------------------------------

    def prepareDayBook(self, rows, opening_cash, opening_bank):
        days = []
        day, voucher = None, None

        for row in rows:
            if not day or day["_date"] != row["date"]:
                day = self.newDay(row["date"])
                days.append(day)
                voucher = None
            if not voucher or voucher["_key"] != (row["entry_type"], row["voucher_no"]):
                voucher = {
                    "_key": (row["entry_type"], row["voucher_no"]),
                    "voucher_id": row["voucher_id"],
                    "entry_type": row["entry_type"],
                    "entry_id": row["entry_id"],
                    "date": row["date"],
                    "rows": [],
                    "_debit": ZERO,
                    "_credit": ZERO,
                }
                day["vouchers"].append(voucher)

            amount = row["amount"] or ZERO
            side = "debit" if row["type"] == DEBIT else "credit"
            voucher[f"_{side}"] += amount
            day[f"_{side}"] += amount
            # the cash/bank position of the day, so a day book can be tallied
            # against the drawer without opening a second report.
            if row["ledger_group"] == CASH_IN_HAND:
                day["_cash_in" if side == "debit" else "_cash_out"] += amount
            elif row["ledger_group"] == BANK_ACCOUNT:
                day["_bank_in" if side == "debit" else "_bank_out"] += amount

            voucher["rows"].append(
                {
                    "id": row["id"],
                    "date": row["date"],
                    "voucher_id": row["voucher_id"],
                    "entry_type": row["entry_type"],
                    "entry_id": row["entry_id"],
                    "ledger": row["ledger"],
                    "particular": row["ledger_str"],
                    # the voucher's own remark stands in when a particular was
                    # saved without one (income/expense cash rows always are).
                    "narration": row["remarks"] or row["entry_remarks"] or "",
                    "type": row["type"],
                    "debit": money(amount) if side == "debit" else 0,
                    "credit": money(amount) if side == "credit" else 0,
                }
            )

        # cash and bank roll from one day into the next, so day two opens where
        # day one closed rather than at the start of the range.
        totals = {"debit": ZERO, "credit": ZERO, "vouchers": 0}
        cash, bank = opening_cash, opening_bank
        for day in days:
            day["_cash_open"], day["_bank_open"] = cash, bank
            cash = cash + day["_cash_in"] - day["_cash_out"]
            bank = bank + day["_bank_in"] - day["_bank_out"]
            totals["debit"] += day["_debit"]
            totals["credit"] += day["_credit"]
            totals["vouchers"] += len(day["vouchers"])
            self.closeDay(day, cash, bank)

        return {
            "data": days,
            "total_debit": money(totals["debit"]),
            "total_credit": money(totals["credit"]),
            "voucher_count": totals["vouchers"],
            "day_count": len(days),
            "opening_cash": money(opening_cash),
            "opening_bank": money(opening_bank),
            "closing_cash": money(cash),
            "closing_bank": money(bank),
        }

    def newDay(self, date):
        return {
            "_date": date,
            "date": date,
            "vouchers": [],
            "_debit": ZERO,
            "_credit": ZERO,
            "_cash_open": ZERO,
            "_bank_open": ZERO,
            "_cash_in": ZERO,
            "_cash_out": ZERO,
            "_bank_in": ZERO,
            "_bank_out": ZERO,
        }

    def closeDay(self, day, cash, bank):
        """
        Replace the day's working Decimals with the numbers the sheet prints.

        `closing_debit`/`closing_credit` is the balancing figure the day book
        traditionally carries: in a sound set of books both sides of a day
        already agree and it prints as 0.00, so anything else on that line is a
        one-sided voucher worth looking at.
        """
        debit, credit = day.pop("_debit"), day.pop("_credit")
        closing_debit = credit - debit if credit > debit else ZERO
        closing_credit = debit - credit if debit > credit else ZERO
        for voucher in day["vouchers"]:
            voucher.pop("_key")
            voucher["debit"] = money(voucher.pop("_debit"))
            voucher["credit"] = money(voucher.pop("_credit"))
        day.pop("_date")
        day.update(
            {
                "debit": money(debit),
                "credit": money(credit),
                "closing_debit": money(closing_debit),
                "closing_credit": money(closing_credit),
                "total_debit": money(debit + closing_debit),
                "total_credit": money(credit + closing_credit),
                "voucher_count": len(day["vouchers"]),
                "opening_cash": money(day.pop("_cash_open")),
                "opening_bank": money(day.pop("_bank_open")),
                "cash_receipt": money(day.pop("_cash_in")),
                "cash_payment": money(day.pop("_cash_out")),
                "bank_receipt": money(day.pop("_bank_in")),
                "bank_payment": money(day.pop("_bank_out")),
                "closing_cash": money(cash),
                "closing_bank": money(bank),
            }
        )
