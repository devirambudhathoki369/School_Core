"""
Closing-balance math for the accounting year-close.

A ledger's closing balance is its opening balance moved by the NET of the
year's postings, i.e. (debits - credits). Each particular row must therefore be
signed by its own side before being summed: journal rows carry `type`,
income/expense rows get theirs from IE_TYPE_CASES -- the same mapping the
trial balance and ledger reports use, so a closing balance always equals what
those reports show for the closed year.

Shared by AEYCloseView and the `repair_aey_opening_balances` command.
"""

from django.db.models import (
    Case,
    Count,
    DecimalField,
    F,
    IntegerField,
    Q,
    Sum,
    Value,
    When,
)
from django.core.exceptions import ValidationError

#
from ..constants.ledger_groups import INCOME_ID, EXPENSE_ID, LEDGER_GROUPS_OPTIONS
from ..models.Particulars import IncomeParticular, ExpenseParticular, JournalParticular
from .ieTypes import IE_TYPE_CASES, NATURAL_BALANCE_TYPES

DEBIT = 1
CREDIT = 2

GROUP_CATEGORIES = {
    lgo.value: lgo.group.value for lgo in LEDGER_GROUPS_OPTIONS if lgo.group
}

SIGNED_AMOUNT = Case(
    When(type=DEBIT, then=F("amount")),
    When(type=CREDIT, then=-F("amount")),
    default=Value(0),
    output_field=DecimalField(max_digits=20, decimal_places=2),
)


def getLedgerMovements(ParticularModel, q, strict=False, entry_kind=None):
    """
    {ledger_id: net movement}, positive = net debit, negative = net credit.

    strict: raise if an income/expense entry has no particular row for its own
    header ledger -- such an entry is only half-posted and would silently skew
    the close.
    """
    pars = ParticularModel.objects.filter(q)
    if strict:
        bad_entries = (
            pars.values("entry_id", "entry__ledger")
            .annotate(match_count=Count("id", filter=Q(ledger=F("entry__ledger"))))
            .filter(match_count=0)
            .values_list("entry_id", flat=True)
            .distinct()
        )
        bad_ids = list(bad_entries)
        if bad_ids:
            entry_model = ParticularModel._meta.get_field("entry").remote_field.model
            raise ValidationError(
                {
                    "bad_entry_ids": bad_ids,
                    "message": f"{len(bad_ids)} entries are incorrect.",
                    "entry": getattr(entry_model, "KEY", None),
                }
            )
    if entry_kind:
        # income/expense rows have no `type` column; derive it from the group.
        pars = pars.annotate(ledger_group=F("ledger__ledger_group")).annotate(
            type=Case(
                *IE_TYPE_CASES[entry_kind],
                default=Value(None),
                output_field=IntegerField(),
            )
        )
    pars = (
        pars.values("ledger")
        .annotate(balance=Sum(SIGNED_AMOUNT))
        .values("ledger", "balance")
    )
    return {par["ledger"]: par["balance"] or 0 for par in pars}


def getAllMovements(q, strict=True):
    """Net movement per ledger across all three entry types."""
    movements = {}
    sources = (
        (IncomeParticular, strict, INCOME_ID),
        (ExpenseParticular, strict, EXPENSE_ID),
        (JournalParticular, False, None),  # journal rows carry their own `type`
    )
    for ParticularModel, is_strict, entry_kind in sources:
        for lid, balance in getLedgerMovements(
            ParticularModel, q, is_strict, entry_kind
        ).items():
            movements[lid] = movements.get(lid, 0) + balance
    return movements


def calculateClosingBalances(ledgers, movements, retained_earning_ledger_id):
    """
    ledgers: dicts of id / ledger_group / opening_balance / balance_type for the
    year being closed. Returns [{ledger_id, opening_balance, balance_type}] to
    carry into the next year.

    Income & expense ledgers close to zero; their net result lands on the
    retained-earning ledger.
    """
    closing_balances = []
    retained_earning = 0
    #
    for ledger in ledgers:
        lid = ledger["id"]
        if lid == retained_earning_ledger_id:
            continue
        #
        opening = ledger["opening_balance"] or 0
        btype = ledger["balance_type"] or NATURAL_BALANCE_TYPES.get(
            ledger["ledger_group"], DEBIT
        )
        group_cat = GROUP_CATEGORIES.get(ledger["ledger_group"])
        # work in one signed space: positive = debit balance, negative = credit.
        signed = (opening if btype == DEBIT else -opening) + movements.get(lid, 0)
        #
        btype = DEBIT if signed >= 0 else CREDIT
        closing = abs(signed)
        """
        handle income/expense, transfer to retained earnings!
        """
        if group_cat in (INCOME_ID, EXPENSE_ID):
            retained_earning += closing if btype == CREDIT else -closing
            closing = 0
        #
        closing_balances.append(
            {
                "ledger_id": lid,
                "opening_balance": closing,
                "balance_type": btype,
            }
        )
    #
    if retained_earning_ledger_id:
        closing_balances.append(
            {
                "ledger_id": retained_earning_ledger_id,
                "opening_balance": abs(retained_earning),
                "balance_type": CREDIT if retained_earning >= 0 else DEBIT,
            }
        )
    return closing_balances
