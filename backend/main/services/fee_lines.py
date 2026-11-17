"""
Phase 3 of the normalization: the screens' fee sums, from the JSON or from the
line tables, behind one switch.

A student ledger's `details` and a receipt's `details` are JSON keyed by a fee
title's id ("12") or by a code ("tn" transportation, "hs" hostel, "od" old dues).
Migration 0108's triggers copy every key into StudentLedgerLine and
StudentInvoiceLine, where a fee title's key becomes `title_id` and anything else
stays in `code`. So `title_id` as text, or else `code`, is the JSON key again,
and a sum over lines answers what a loop over the JSON answers, in SQL.

`settings.NORMALIZED_READS` picks the source. It stays False (the JSON) until
`manage.py normalization_audit` is clean on that database, because the triggers
let a write through when a sync fails and the lines could then be short. Both
paths read a value the way the database does (norm_numeric in 0108): a number,
or a string that is plainly a number. Anything else counts for nothing.

Read the lines; never write them. Tests: main/test_fee_lines.py runs both paths
over the same rows and requires the same answer.
"""

import re
from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from django.conf import settings
from django.db.models import Q, Sum

from main.models import StudentInvoiceLine, StudentLedgerLine

TITLE_NAMES_KEY = "__titles"
PAISA = Decimal("0.01")
_NUMERIC_TEXT = re.compile(r"^\s*-?[0-9]+(\.[0-9]+)?\s*$")


def use_line_tables():
    return bool(getattr(settings, "NORMALIZED_READS", False))


def json_amount(value):
    """A JSON amount as the database reads it, or None when it is not one.

    Rounded to the paisa, half away from zero, as a numeric(14, 2) line column
    stores it, so both paths agree to the last digit."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        try:
            amount = Decimal(str(value))
        except InvalidOperation:
            return None
    elif isinstance(value, str) and _NUMERIC_TEXT.match(value):
        amount = Decimal(value.strip())
    else:
        return None
    if not amount.is_finite():
        return None
    return amount.quantize(PAISA, rounding=ROUND_HALF_UP)


def _wanted(keys):
    return None if keys is None else {str(k) for k in keys}


def _line_key_filter(keys):
    """The lines whose JSON key is one of `keys`."""
    titles = [int(k) for k in keys if k.isdigit()]
    codes = [k for k in keys if not k.isdigit()]
    # A fee title whose row is gone keeps its id as the code, so a numeric key
    # is looked for in both places.
    return Q(title_id__in=titles) | Q(code__in=codes + [str(t) for t in titles], title_id__isnull=True)


def _line_rows(model, parent, parents, keys, value_field):
    rows = model.objects.filter(**{f"{parent}__in": parents.values("id")})
    if keys is not None:
        rows = rows.filter(_line_key_filter(keys))
    return (
        rows.values(f"{parent}__student_id", "title_id", "code")
        .annotate(total=Sum(value_field))
        .values_list(f"{parent}__student_id", "title_id", "code", "total")
    )


def _from_lines(model, parent, parents, keys, value_field):
    totals = defaultdict(lambda: defaultdict(Decimal))
    for student_id, title_id, code, total in _line_rows(model, parent, parents, keys, value_field):
        if total is None:
            continue
        totals[student_id][str(title_id) if title_id is not None else code] += total
    return totals


def student_ledger_totals(ledgers, keys=None):
    """{student id: {JSON key: total billed}} over a StudentLedger queryset."""
    keys = _wanted(keys)
    if use_line_tables():
        return _from_lines(StudentLedgerLine, "ledger", ledgers, keys, "amount")
    totals = defaultdict(lambda: defaultdict(Decimal))
    for student_id, details in ledgers.values_list("student_id", "details"):
        if not isinstance(details, dict):
            continue
        for key, value in details.items():
            if key == TITLE_NAMES_KEY or (keys is not None and key not in keys):
                continue
            amount = json_amount(value)
            if amount is not None:
                totals[student_id][key] += amount
    return totals


def student_invoice_totals(invoices, keys=None):
    """{student id: {JSON key: total received}} over a StudentInvoice queryset.

    A receipt's line is {amt, due, dis}; `amt` already includes the discount,
    as in the student ledger (LedgerViews). A cash receipt is a list of
    particulars with no fee titles: its lines carry the code "cash"."""
    keys = _wanted(keys)
    if use_line_tables():
        return _from_lines(StudentInvoiceLine, "invoice", invoices, keys, "amount")
    totals = defaultdict(lambda: defaultdict(Decimal))
    for student_id, details in invoices.values_list("student_id", "details"):
        if isinstance(details, list):
            if keys is not None and "cash" not in keys:
                continue
            for item in details:
                amount = json_amount(item.get("AMT")) if isinstance(item, dict) else None
                if amount is not None:
                    totals[student_id]["cash"] += amount
            continue
        if not isinstance(details, dict):
            continue
        for key, value in details.items():
            if key == TITLE_NAMES_KEY or (keys is not None and key not in keys):
                continue
            amount = json_amount(value.get("amt") if isinstance(value, dict) else value)
            if amount is not None:
                totals[student_id][key] += amount
    return totals


__all__ = ["use_line_tables", "json_amount", "student_ledger_totals", "student_invoice_totals"]
