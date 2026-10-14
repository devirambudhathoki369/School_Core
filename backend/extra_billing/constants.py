"""Domain vocabulary for the extra-billing module.

Kept in ONE place because three layers have to agree on every number here — the
model's `choices`, the view that labels a row for a report, and the frontend's
dropdowns (`smsys/src/configs/extra_billing.js`). When you change one file,
change the other.
"""

# ------------------------------------------------------------ who is billed
# A "party" is anybody the school bills who is NOT a student: the tenant of a
# shutter, a canteen contractor, a bank running an ATM in the compound, a
# neighbour on the school's water line. Students stay in their own tables and
# are untouched by everything in this app.
PARTY_TENANT = 1
PARTY_SHOP = 2
PARTY_CANTEEN = 3
PARTY_INSTITUTION = 4
PARTY_QUARTER = 5
PARTY_OTHER = 6
PARTY_TYPE_CHOICES = (
    (PARTY_TENANT, "Tenant"),
    (PARTY_SHOP, "Shop / shutter"),
    (PARTY_CANTEEN, "Canteen / cafeteria"),
    (PARTY_INSTITUTION, "Institution / office"),
    (PARTY_QUARTER, "Staff quarter"),
    (PARTY_OTHER, "Other"),
)

# ------------------------------------------------------------- how they paid
# The same four modes a student receipt offers (main/models/Invoice.py), with
# the same numbers, so a cashier reads one vocabulary all day.
MODE_CASH = 1
MODE_BANK = 2
MODE_CHEQUE = 3
MODE_WALLET = 4
PAYMENT_MODES = (
    (MODE_CASH, "cash"),
    (MODE_BANK, "bank"),
    (MODE_CHEQUE, "cheque"),
    (MODE_WALLET, "wallet"),
)

# ------------------------------------------------------------------- months
# Nepali months, 1 = Baisakh. Matches smsys/src/components/inputs/options/months.js.
MONTHS = (
    (1, "baisakh"), (2, "jestha"), (3, "ashad"), (4, "shrawn"),
    (5, "bhadra"), (6, "ashoj"), (7, "kartik"), (8, "mangsir"),
    (9, "poush"), (10, "magh"), (11, "falgun"), (12, "chaitra"),
)
MONTH_NAMES = {value: name for value, name in MONTHS}

# Reserved keys inside a `details` JSON blob.
#   OPENING_DUE — what the party already owed on the day they were entered into
#                 the system. It is a charge like any other to every reader, but
#                 it has no BillingTitle behind it, so it gets a key of its own
#                 (the student side does exactly this with "od"/"ob").
#   TITLE_NAMES — snapshot of each title's name at write time, so a receipt
#                 printed years later still says what was actually charged even
#                 if the title has since been renamed.
OPENING_DUE = "od"
TITLE_NAMES_KEY = "__titles"
RESERVED_DETAIL_KEYS = (TITLE_NAMES_KEY,)


def label(choices, value, default="—"):
    return dict(choices).get(value, default)
