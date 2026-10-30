"""The ONLY arithmetic on a canteen account.

    balance       = sum of the account's active transactions
    spent on day  = what its active purchases took that day

The counter, the accounts page, the statement, the fee posting and the reports
all call these, so none of them can disagree about what a child has left.
"""

from decimal import Decimal

from django.db.models import Sum

from ..constants import TXN_PURCHASE
from ..models import CanteenTransaction

ZERO = Decimal("0.00")

def live(queryset):
    """The transactions that make up a balance: the active ones. EVERY sum of a
    balance in this app goes through here — the counter, the statement, the
    dues, the reports and the superadmin's "held on cards" figure."""
    return queryset.filter(is_active=True)


def balances(account_ids):
    """{account id: balance} for every id asked about (0 for an untouched one)."""
    ids = [i for i in (account_ids or []) if i]
    out = {i: ZERO for i in ids}
    if not ids:
        return out
    for row in (
        live(CanteenTransaction.objects.filter(account_id__in=ids))
        .values("account_id")
        .annotate(total=Sum("amount"))
    ):
        out[row["account_id"]] = row["total"] or ZERO
    return out


def balance(account_id):
    return balances([account_id]).get(account_id, ZERO)


def spent_on(account_ids, date):
    """{account id: what its purchases took on `date`} — the daily limit's input."""
    ids = [i for i in (account_ids or []) if i]
    out = {i: ZERO for i in ids}
    if not ids:
        return out
    for row in (
        CanteenTransaction.objects.filter(
            account_id__in=ids, is_active=True, kind=TXN_PURCHASE, date=date
        )
        .values("account_id")
        .annotate(total=Sum("amount"))
    ):
        # purchases are stored negative; "spent" is the positive figure
        out[row["account_id"]] = -(row["total"] or ZERO)
    return out


def effective_limits(account, settings, due_allowance=0):
    """(daily limit, credit limit) for this account: its own figure where it
    has one, the school's otherwise. A daily limit of 0 means none.

    `due_allowance` is what a "cash or due" use type lets this student owe
    (methods/plans.due_allowance); the account may go down to the larger of
    that and its ordinary credit limit."""
    daily = account.daily_limit if account and account.daily_limit is not None else settings.daily_limit
    credit = (
        account.credit_limit if account and account.credit_limit is not None else settings.credit_limit
    )
    return Decimal(daily or 0), max(Decimal(credit or 0), Decimal(due_allowance or 0))
