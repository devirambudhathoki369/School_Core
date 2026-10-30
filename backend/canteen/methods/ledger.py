"""The canteen's own ledger, item by item — the ONE place dues are worked out.

Every transaction on a canteen account carries `details` {item id: amount}:
    charges   counter purchases on the account, and monthly postings
    payments  what a receipt paid, item by item; whatever it did not name is an
              ADVANCE (a top-up), held against whatever is charged next

For each item:  due = charged − paid.  An advance is then set against the dues,
oldest item first, so a student who topped up Rs. 500 and was posted Rs. 1,500
of tiffin owes Rs. 1,000, not Rs. 1,500 with Rs. 500 sitting beside it. Always:

    sum(dues) − advance = −(account balance)

which is checked, so this table and the balance can never disagree. The
collect screen, the statement, the dues report and the receipt all read it.
Amounts are Decimals to the paisa throughout (money.exact).
"""

import logging
from collections import defaultdict

from ..constants import CHARGE_KINDS, TXN_REFUND, TXN_TOPUP
from ..models import CanteenItem, CanteenTransaction
from .balances import live
from .money import exact

TITLES = "__titles"
OTHER = "other"
ZERO = exact(0)
log = logging.getLogger(__name__)


def detail_rows(details):
    """(key, Decimal) pairs of a details blob, skipping the name snapshot."""
    for key, value in (details or {}).items():
        if key == TITLES:
            continue
        amount = exact(value)
        if amount:
            yield str(key), amount


def item_names(school_id):
    return {str(i): n for i, n in CanteenItem.objects.filter(school_id=school_id).values_list("id", "name")}


def statements(school_id, account_ids):
    """{account id: {"items": [...], "advance": Decimal, "balance": Decimal}}."""
    ids = [i for i in account_ids if i]
    charged = defaultdict(lambda: defaultdict(lambda: ZERO))
    paid = defaultdict(lambda: defaultdict(lambda: ZERO))
    first = defaultdict(dict)
    credit = defaultdict(lambda: ZERO)
    balance = defaultdict(lambda: ZERO)
    snap = {}
    txns = live(CanteenTransaction.objects.filter(account_id__in=ids)).order_by("id").values(
        "account_id", "kind", "amount", "details", "id"
    )
    for t in txns:
        acc = t["account_id"]
        balance[acc] += t["amount"]
        snap.update({str(k): v for k, v in ((t["details"] or {}).get(TITLES) or {}).items()})
        if t["kind"] in CHARGE_KINDS:
            named = ZERO
            for key, amount in detail_rows(t["details"]):
                charged[acc][key] += amount
                named += amount
                first[acc].setdefault(key, t["id"])
            # A charge whose details do not add up to it (none should) still
            # counts, under "Other", so the dues can never lose a rupee.
            if -t["amount"] - named:
                charged[acc][OTHER] += -t["amount"] - named
                first[acc].setdefault(OTHER, t["id"])
        elif t["kind"] == TXN_TOPUP:
            allocated = ZERO
            for key, amount in detail_rows(t["details"]):
                paid[acc][key] += amount
                allocated += amount
            credit[acc] += t["amount"] - allocated
        elif t["kind"] == TXN_REFUND:
            credit[acc] += t["amount"]  # negative: advance handed back
    names = {**snap, **item_names(school_id), OTHER: "Other"}
    out = {}
    for acc in ids:
        keys = sorted(set(charged[acc]) | set(paid[acc]), key=lambda k: (first[acc].get(k, 10**12), names.get(k, k)))
        rows, advance = [], credit[acc]
        for key in keys:
            raw = charged[acc][key] - paid[acc][key]
            if raw < 0:          # overpaid (a charge since voided): it is advance
                advance += -raw
                raw = ZERO
            rows.append({"item": key, "name": names.get(key, "Item"), "charged": charged[acc][key],
                         "paid": paid[acc][key], "raw_due": raw})
        for row in rows:          # the advance against the oldest dues first
            used = min(row["raw_due"], max(advance, ZERO))
            row["due"] = row["raw_due"] - used
            advance -= used
        total_due = sum((r["due"] for r in rows), ZERO)
        if total_due - advance != -balance[acc]:   # arithmetic says never; say so if it does
            log.error("canteen ledger mismatch: account %s due %s advance %s balance %s",
                      acc, total_due, advance, balance[acc])
        out[acc] = {"items": rows, "advance": advance, "balance": balance[acc], "due": total_due}
    return out


def statement(school_id, account_id):
    return statements(school_id, [account_id])[account_id]


def details_blob(amounts, names):
    """{item id: "amount", "__titles": {...}} — how every row here stores money."""
    blob = {str(k): str(exact(v)) for k, v in amounts.items() if exact(v)}
    blob[TITLES] = {str(k): names.get(str(k), "Item") for k in amounts if exact(amounts[k])}
    return blob
