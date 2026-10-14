from .payment import OPENING_BALANCE, CARRY_FORWARD_OUT

# The earning titles a salary is made of, in the order they are shown.
# `funds` sits right behind `salary` because it behaves identically -- see
# StaffFinanceInfo.funds. A title added here appears on the salary sheet, the
# payment screen's title list and the staff ledger without further edits; old
# postings that predate it simply carry 0.
ALL_TITLES = ["salary", "funds", "grade", "allowance", "extra"]

# The two lines a payroll year-close writes for a member of staff who is still
# owed money (or was paid ahead): `cfo` in the year that closed, taking the
# balance out of it, and `ob` in the year after, bringing the same amount in.
# They are the student ledger's own keys (constants/payment.py) on purpose: an
# unpaid salary carried into the new year is the staff side of "old dues".
# Neither is an earning, so neither may ever be counted as salary posted.
CARRY_TITLES = (OPENING_BALANCE, CARRY_FORWARD_OUT)

# What a statement calls each title. The earning titles print as they are.
TITLE_LABELS = {
    OPENING_BALANCE: "old dues",
    CARRY_FORWARD_OUT: "carried forward",
}
