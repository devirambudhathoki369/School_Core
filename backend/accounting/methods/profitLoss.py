"""
The year's result, computed once for every report that needs it.

The profit & loss report and the balance sheet used to disagree by construction:
the P&L added up the income and expense particulars, and the balance sheet
carried a hardcoded `net_profit_loss = 0`. A balance sheet whose equity side is
missing the year's result can never balance, so this module exists to give both
of them the SAME number from the SAME particulars.

Two rules live here, and both were previously wrong in the P&L:

1. A posting on the ledger group's natural side adds to the total; a posting on
   the opposite side is a reversal and must come back OFF it. Income and expense
   particulars are always on their natural side (`ieTypes` derives the side from
   the group), so this only ever bites on JOURNAL postings into an income or
   expense ledger -- which is exactly what a correction voucher is. Summing them
   unsigned moved the total the wrong way by twice the correction.

2. `Sales` is income. It is listed in the income groups but was bucketed by a
   separate hardcoded `[11, 15]` test that left it out, so every sale was
   subtracted as though it were a cost.
"""

from decimal import Decimal, InvalidOperation

#
from .ieTypes import NATURAL_BALANCE_TYPES
from ..constants.ledger_groups import BALANCE_TYPES

DEBIT = BALANCE_TYPES["DEBIT"].value
CREDIT = BALANCE_TYPES["CREDIT"].value

INCOME_LEDGER_GROUPS = (
    11,  # Direct Income
    15,  # Indirect Income
    21,  # Sales
)
EXPENSE_LEDGER_GROUPS = (
    10,  # Direct Expenses
    12,  # Duties and Tax
    14,  # Indirect Expenses
    20,  # Purchase
    22,  # Mics, Expenses (assets)
)
PROFIT_LOSS_LEDGER_GROUPS = (*INCOME_LEDGER_GROUPS, *EXPENSE_LEDGER_GROUPS)


def sign_of(ledger_group_id, entry_type):
    """
    +1 for a posting on the group's natural side, -1 for one against it.

    Deliberately asymmetric: only an explicit posting on the OPPOSITE side flips
    the sign. A row whose side we cannot read (a `type` of None, which the
    `ieTypes` CASE emits for a ledger group it has no case for) keeps counting
    the way it always has rather than silently reversing.
    """
    natural = NATURAL_BALANCE_TYPES.get(ledger_group_id)
    if natural is None:
        return 1
    opposite = CREDIT if natural == DEBIT else DEBIT
    return -1 if entry_type == opposite else 1


def signed_amount(particular):
    """A particular's amount with its side applied, or None if unreadable."""
    try:
        amount = Decimal(particular.get("amount") or "0")
    except (TypeError, InvalidOperation):
        return None
    return amount * sign_of(particular.get("ledger_group"), particular.get("type"))


def split_income_expense(particulars):
    """
    (income, expense) for the period, both POSITIVE, reversals already netted.

    Net profit is `income - expense`: positive is a profit, negative a loss.
    """
    income = Decimal("0")
    expense = Decimal("0")
    for par in particulars:
        amount = signed_amount(par)
        if amount is None:
            continue
        if par.get("ledger_group") in INCOME_LEDGER_GROUPS:
            income += amount
        else:
            expense += amount
    return income, expense
