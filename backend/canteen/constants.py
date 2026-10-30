"""Domain vocabulary for the canteen module.

Kept in ONE place because three layers have to agree on every number here — the
models' `choices`, the views that label a row, and the frontend's dropdowns
(`smsys/src/configs/canteen.js`). When you change one file, change the other.
"""

# ------------------------------------------------------------- who runs it
# Recorded for the school's own information. The canteen keeps its own
# billing (its own ledger, receipts and dues) whoever runs it — nothing in this
# app writes to the school's fee bills.
RUN_BY_SCHOOL = 1
RUN_BY_CONTRACTOR = 2
RUN_BY_CHOICES = (
    (RUN_BY_SCHOOL, "The school"),
    (RUN_BY_CONTRACTOR, "A contractor"),
)

# ------------------------------------------------------------------ buyers
BUYER_STUDENT = 1
BUYER_STAFF = 2
BUYER_WALKIN = 3
BUYER_CHOICES = (
    (BUYER_STUDENT, "Student"),
    (BUYER_STAFF, "Staff"),
    (BUYER_WALKIN, "Walk-in"),
)

# ---------------------------------------------------------- how a sale is paid
# CASH is money over the counter. ACCOUNT is the buyer's canteen account — a
# prepaid balance their family topped up, or, where the school allows it, credit
# up to a limit, collected later at Collect & Receipt.
PAY_CASH = 1
PAY_ACCOUNT = 2
# PLAN is a meal already paid for by a monthly use type (tiffin monthly, day
# care): served and counted at the counter, charged nothing there — the money
# comes through the month's canteen posting (views/PlanViews).
PAY_PLAN = 3
PAYMENT_CHOICES = (
    (PAY_CASH, "Cash"),
    (PAY_ACCOUNT, "Account"),
    (PAY_PLAN, "Monthly plan"),
)

# ---------------------------------------------------------------- use types
# How a student uses the canteen. A school defines its own (CanteenPlan); each
# is one of two kinds:
#   MONTHLY   a regular user: the type's item is posted to them every month at
#             their class's rate, like the fee ledger posting — day care,
#             tiffin monthly
#   PER_USE   paid when taken: cash at the counter, or due on their canteen
#             account up to the type's due limit — tiffin cash or due
PLAN_MONTHLY = 1
PLAN_PER_USE = 2
PLAN_KIND_CHOICES = (
    (PLAN_MONTHLY, "Monthly (posted every month)"),
    (PLAN_PER_USE, "Cash or due (paid when taken)"),
)

# ------------------------------------------------- the canteen's own ledger
# A buyer's canteen account IS their canteen ledger. Its balance is the plain
# sum of its active transactions, so every kind carries its own sign:
#   TOPUP     +  money paid in at the canteen office (a numbered receipt),
#               set against the item-wise dues it names; anything over is an
#               advance
#   PURCHASE  -  a counter sale taken from the account (due, or prepaid)
#   REFUND    -  advance handed back in cash (also a numbered receipt)
#   POSTING   -  the month's charges for a regular user, item by item at their
#               class's rate (views/PlanViews.MonthlyPostingView)
# Charges and payments carry `details` {item id: amount}, so dues are item-wise.
# (5 was a fee-bill posting that no longer exists; never reuse it.)
TXN_TOPUP = 1
TXN_PURCHASE = 2
TXN_REFUND = 3
TXN_POSTING = 6
TXN_CHOICES = (
    (TXN_TOPUP, "Payment"),
    (TXN_PURCHASE, "Counter purchase"),
    (TXN_REFUND, "Refund"),
    (TXN_POSTING, "Monthly posting"),
)
CHARGE_KINDS = (TXN_PURCHASE, TXN_POSTING)

# Nepali months, 1 = Baisakh. Matches smsys/src/components/inputs/options/months.js.
MONTH_NAMES = {
    1: "Baisakh", 2: "Jestha", 3: "Ashad", 4: "Shrawan", 5: "Bhadra", 6: "Ashoj",
    7: "Kartik", 8: "Mangsir", 9: "Poush", 10: "Magh", 11: "Falgun", 12: "Chaitra",
}

# How money came in or went out at the office. The same four a student receipt
# offers (main/models/Invoice.py), with the same numbers.
MODE_CASH = 1
MODE_BANK = 2
MODE_CHEQUE = 3
MODE_WALLET = 4
MODES = (
    (MODE_CASH, "cash"),
    (MODE_BANK, "bank"),
    (MODE_CHEQUE, "cheque"),
    (MODE_WALLET, "wallet"),
)

# ------------------------------------------------------------- food marks
FOOD_NONE = 0
FOOD_VEG = 1
FOOD_NONVEG = 2
FOOD_CHOICES = (
    (FOOD_NONE, "—"),
    (FOOD_VEG, "Veg"),
    (FOOD_NONVEG, "Non-veg"),
)

# ------------------------------------------------------------------- pages
# The canteen's pages, numbered exactly as the frontend numbers them
# (smsys/src/configs/permissions PERMISSIONS.CANTEEN). A member of staff holds
# them in Staff.permissions, a canteen user in CanteenUser.permissions, and a
# school admin holds every one. views/BaseViews.CanteenBaseView.gate checks
# them on every request, so a page left off the menu is also refused here.
PAGE_COUNTER = 2701
PAGE_ITEMS = 2702
PAGE_ACCOUNTS = 2703
# 2704 retired (it posted canteen owing onto the fee bill); never reuse it
PAGE_REPORTS = 2705
PAGE_SETUP = 2706
PAGE_USE_TYPES = 2707
PAGE_MONTHLY_POSTING = 2708
PAGE_COLLECT = 2709
PAGE_USERS = 2710
PAGE_CHOICES = (
    (PAGE_COUNTER, "Counter"),
    (PAGE_ITEMS, "Items & Rates"),
    (PAGE_USE_TYPES, "Use Types"),
    (PAGE_MONTHLY_POSTING, "Monthly Posting"),
    (PAGE_COLLECT, "Collect & Receipt"),
    (PAGE_ACCOUNTS, "Card Accounts"),
    (PAGE_REPORTS, "Canteen Reports"),
    (PAGE_SETUP, "Canteen Setup"),
    (PAGE_USERS, "Canteen Users"),
)
PAGES = tuple(value for value, _ in PAGE_CHOICES)

# A sale line's quantity. Anything past this is a typo at a snack counter, not
# an order — and a typo here is money taken from a child's account.
MAX_QTY = 99
# Lines on one sale.
MAX_LINES = 40


def label(choices, value, default="—"):
    return dict(choices).get(value, default)
