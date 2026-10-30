"""Exact money for this app, and the one way it is written onto a fee ledger.

Inside the canteen every amount is a Decimal quantized to the paisa — prices,
line amounts, totals, balances — so nothing is ever rounded twice.

A fee-ledger line (`StudentLedger.details`) is read by the billing core with
`Decimal(value)` and set against receipts whose amounts are JSON NUMBERS. The
canteen line must therefore be a JSON number too: written as a string, an amount
like 33.33 would read back exact while the receipt that paid it reads back as
33.3299999…, leaving a phantom paisa of "due". A whole amount is written as an
int (no float at all); anything else as the float of its two-decimal value,
which is exactly how a receipt for it is stored.
"""

from decimal import ROUND_HALF_UP, Decimal

PAISA = Decimal("0.01")


def exact(value):
    """A Decimal to the paisa from whatever arrived (str, int, float, Decimal)."""
    if value in (None, ""):
        return Decimal("0.00")
    return Decimal(str(value)).quantize(PAISA, rounding=ROUND_HALF_UP)


def ledger_number(amount):
    """The JSON number a fee-ledger line carries for `amount`."""
    amount = exact(amount)
    if amount == amount.to_integral_value():
        return int(amount)
    return float(amount)
