"""What a party owes — computed, never stored.

ONE function answers it for a list of parties (`party_balances`) and one answers
it title by title for a single party (`title_wise_outstanding`). Every screen in
this module — the party list, the payment form, the dues report, the receipt —
goes through these two, so the number a tenant is shown on the dues report is by
construction the number the receipt collects against. Two readers that each did
their own arithmetic is how a dues report and a ledger come to disagree, which
this product has already paid for once ([[dues-reports-must-agree]]).

    balance = opening_due + charges - payments

All sums are over ACTIVE rows only: a voided receipt or a withdrawn bill run is
soft-deleted, and must stop counting the moment it is voided while staying on
the record for anyone who asks what happened.
"""

from collections import defaultdict
from decimal import Decimal

from ..constants import OPENING_DUE, RESERVED_DETAIL_KEYS, TITLE_NAMES_KEY
from ..models.Billing import ExtraInvoice, ExtraLedger
from ..models.Party import BillingParty, BillingTitle, PartyCharge

ZERO = Decimal("0.00")


def _money(value):
    """JSON gives decimals as strings; `"0" + "500"` is `"0500"`."""
    try:
        return Decimal(str(value if value not in (None, "") else 0))
    except Exception:
        return ZERO


def detail_rows(details):
    """Yield (key, amount) for the real money keys of a details blob."""
    if not isinstance(details, dict):
        return
    for key, value in details.items():
        if key in RESERVED_DETAIL_KEYS:
            continue
        yield str(key), _money(value)


def party_balances(school_id, party_ids=None, upto_date=None):
    """{party_id: {"opening", "charged", "paid", "balance"}} in three queries.

    `upto_date` (a Nepali date string) narrows both sides to rows dated on or
    before it, which is what a statement "as on" a date means. Nepali dates are
    stored as zero-padded YYYY-MM-DD strings, so a string comparison IS a date
    comparison — the same trick every other report in this product uses.
    """
    parties = BillingParty.objects.filter(school_id=school_id, is_active=True)
    if party_ids is not None:
        parties = parties.filter(id__in=party_ids)
    out = {
        row["id"]: {
            "opening": _money(row["opening_due"]),
            "charged": ZERO,
            "paid": ZERO,
            "balance": ZERO,
        }
        for row in parties.values("id", "opening_due")
    }
    if not out:
        return out

    ledgers = ExtraLedger.objects.filter(party_id__in=out.keys(), is_active=True)
    invoices = ExtraInvoice.objects.filter(party_id__in=out.keys(), is_active=True)
    if upto_date:
        ledgers = ledgers.filter(date__lte=upto_date)
        invoices = invoices.filter(date__lte=upto_date)

    for party_id, total in ledgers.values_list("party_id", "total"):
        out[party_id]["charged"] += _money(total)
    for party_id, total in invoices.values_list("party_id", "total_paid"):
        out[party_id]["paid"] += _money(total)
    for row in out.values():
        row["balance"] = row["opening"] + row["charged"] - row["paid"]
    return out


def monthly_rates(party_ids):
    """{party_id: what their rate card bills them every month} in one query.

    The rate card summed per party, active rows only. A party with no rate card
    is simply absent, so read it with `.get(party_id, 0)`. The party list and
    every report take the figure from here, so "per month" on the Parties page
    and "monthly rate" on a report are the same number.
    """
    out = defaultdict(lambda: ZERO)
    for party_id, amount in PartyCharge.objects.filter(
        party_id__in=list(party_ids), is_active=True
    ).values_list("party_id", "amount"):
        out[party_id] += _money(amount)
    return dict(out)


def title_wise_outstanding(party):
    """What this ONE party still owes, split by title.

    Returns a list of rows ready for the payment form and the statement header:
        [{"title": <id|"od">, "name": "Rent", "charged", "paid", "due"}, ...]

    The opening due is carried as the pseudo-title "od" so a party brought in
    mid-year can be collected from on the same screen as everybody else, without
    a second code path that only some reports remember to add.
    """
    charged = defaultdict(lambda: ZERO)
    paid = defaultdict(lambda: ZERO)
    names = {}

    opening = _money(getattr(party, "opening_due", 0))
    if opening:
        charged[OPENING_DUE] += opening
        names[OPENING_DUE] = "Old dues"

    for details in ExtraLedger.objects.filter(party=party, is_active=True).values_list(
        "details", flat=True
    ):
        for key, amount in detail_rows(details):
            charged[key] += amount
        names.update((details or {}).get(TITLE_NAMES_KEY) or {})
    for details in ExtraInvoice.objects.filter(party=party, is_active=True).values_list(
        "details", flat=True
    ):
        for key, amount in detail_rows(details):
            paid[key] += amount
        names.update((details or {}).get(TITLE_NAMES_KEY) or {})

    # Current titles win over the snapshot: a renamed title should read the new
    # way on a screen being used TODAY. The snapshot is what keeps an old
    # receipt honest, and that is printed from the receipt's own blob.
    live = {
        str(row["id"]): row["title"]
        for row in BillingTitle.objects.filter(
            school_id=party.school_id, is_active=True
        ).values("id", "title")
    }
    names.update(live)
    names.setdefault(OPENING_DUE, "Old dues")

    keys = set(charged) | set(paid)
    rows = []
    for key in keys:
        rows.append(
            {
                "title": key,
                "name": names.get(key) or f"Title {key}",
                "charged": charged[key],
                "paid": paid[key],
                "due": charged[key] - paid[key],
            }
        )
    # Old dues first, then the school's own title order, then anything orphaned.
    order = {str(row["id"]): row["order"] for row in BillingTitle.objects.filter(
        school_id=party.school_id
    ).values("id", "order")}
    rows.sort(key=lambda r: (0 if r["title"] == OPENING_DUE else 1, order.get(r["title"], 999), r["name"]))
    return rows


def posted_months(school_id, economic_year_id, party_ids=None):
    """{party_id: {month, ...}} already billed in this fiscal year.

    The bill run asks this so it can refuse to charge Shrawan twice — double
    billing is the single most damaging mistake this module can make, and it is
    silent until a tenant adds up their own receipts.
    """
    rows = ExtraLedger.objects.filter(
        school_id=school_id, economic_year_id=economic_year_id, is_active=True
    )
    if party_ids is not None:
        rows = rows.filter(party_id__in=party_ids)
    out = defaultdict(set)
    for party_id, months in rows.values_list("party_id", "months"):
        for month in months or []:
            try:
                out[party_id].add(int(month))
            except (TypeError, ValueError):
                continue
    return out
