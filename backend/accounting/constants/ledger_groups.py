from dataclasses import dataclass
from typing import Optional, List


@dataclass(frozen=True)
class BalanceType:
    value: int
    name: str


@dataclass(frozen=True)
class LedgerGroupCategory:
    value: int
    name: str


@dataclass(frozen=True)
class CashFlowCategory:
    value: int
    name: str


# -----

BALANCE_TYPES = {
    "DEBIT": BalanceType(1, "debit"),
    "CREDIT": BalanceType(2, "credit"),
}

LEDGER_GROUP_CATEGORIES = {
    "INCOME": LedgerGroupCategory(1, "income"),
    "EXPENSE": LedgerGroupCategory(2, "expense"),
    "ASSET": LedgerGroupCategory(3, "asset"),
    "LIABILITY": LedgerGroupCategory(4, "liability"),
    "EQUITY": LedgerGroupCategory(5, "equity"),
}

CASH_FLOW_CATEGORIES = {
    "OPERATING": CashFlowCategory(1, "operating"),
    "INVESTING": CashFlowCategory(2, "investing"),
    "FINANCING": CashFlowCategory(3, "financing"),
}

# -----
INCOME_ID = LEDGER_GROUP_CATEGORIES["INCOME"].value
EXPENSE_ID = LEDGER_GROUP_CATEGORIES["EXPENSE"].value
IE_TYPES = {
    INCOME_ID: {
        # Receiving money - debit side (Cash/Bank)
        LEDGER_GROUP_CATEGORIES["ASSET"]: BALANCE_TYPES["DEBIT"],
        # Expense groups (rare in income, but safe default)
        LEDGER_GROUP_CATEGORIES["EXPENSE"]: BALANCE_TYPES["DEBIT"],
        # Income sources - credit side
        LEDGER_GROUP_CATEGORIES["INCOME"]: BALANCE_TYPES["CREDIT"],
        # Liabilities / Equity - treated as credit (fund sources)
        LEDGER_GROUP_CATEGORIES["LIABILITY"]: BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"]: BALANCE_TYPES["CREDIT"],
    },
    EXPENSE_ID: {
        # Paying out - credit side (Cash/Bank)
        LEDGER_GROUP_CATEGORIES["ASSET"]: BALANCE_TYPES["CREDIT"],
        # Earning-side ledgers - also credit
        LEDGER_GROUP_CATEGORIES["INCOME"]: BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"]: BALANCE_TYPES["CREDIT"],
        # Expense or liability - debit (actual spending/obligation)
        LEDGER_GROUP_CATEGORIES["EXPENSE"]: BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"]: BALANCE_TYPES["DEBIT"],
    },
}
# -----


@dataclass(frozen=True)
class LedgerGroupOption:
    value: int
    name: str
    type: BalanceType
    group: Optional[LedgerGroupCategory]
    flow: Optional[CashFlowCategory]


LEDGER_GROUPS_OPTIONS: List[LedgerGroupOption] = [
    LedgerGroupOption(
        1,
        "Account Payable",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        2,
        "Account Receivable",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        3,
        "Bank Account",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        None,
    ),
    LedgerGroupOption(
        4,
        "Bank Occ Account",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        None,
    ),
    LedgerGroupOption(
        5,
        "Bank OD Account",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        None,
    ),
    LedgerGroupOption(
        6,
        "Capital A/C",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        7,
        "Cash in Hand",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        None,
    ),
    LedgerGroupOption(
        8,
        "Current Assets",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        9,
        "Current Liabilities",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        10,
        "Direct Expenses",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EXPENSE"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        11,
        "Direct Income",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["INCOME"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        12,
        "Duties and Tax",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EXPENSE"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        13,
        "Fix Assets",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["INVESTING"],
    ),
    LedgerGroupOption(
        14,
        "Indirect Expenses",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EXPENSE"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        15,
        "Indirect Income",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["INCOME"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        16,
        "Investment",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["INVESTING"],
    ),
    LedgerGroupOption(
        17,
        "Loan and Advance",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["INVESTING"],
    ),
    LedgerGroupOption(
        18,
        "Loans",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        19,
        "Provision",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        20,
        "Purchase",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EXPENSE"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        21,
        "Sales",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["INCOME"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        22,
        "Mics, Expenses (assets)",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EXPENSE"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        23,
        "Reserve and surplus",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        24,
        "Retained Earning",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        25,
        "Stock in Hand (closing stock)",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        26,
        "Sundry Creditors",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        27,
        "Sundry Debtors",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        28,
        "Suspense A/C",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        None,
    ),
    LedgerGroupOption(
        29,
        "Unsecured Loan",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        30,
        "Stock in Hand (opening stock)",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["ASSET"],
        CASH_FLOW_CATEGORIES["OPERATING"],
    ),
    LedgerGroupOption(
        31,
        "Secured Loan",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        32,
        "Bonus Share",
        BALANCE_TYPES["DEBIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        33,
        "Short Term Loan",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["LIABILITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
    LedgerGroupOption(
        34,
        "Share Capital",
        BALANCE_TYPES["CREDIT"],
        LEDGER_GROUP_CATEGORIES["EQUITY"],
        CASH_FLOW_CATEGORIES["FINANCING"],
    ),
]


__all__ = [
    "BalanceType",
    "BALANCE_TYPES" "LedgerGroupCategory",
    "LEDGER_GROUP_CATEGORIES",
    "CashFlowCategory",
    "CASH_FLOW_CATEGORIES",
    "LedgerGroupOption",
    "LEDGER_GROUPS_OPTIONS",
    "INCOME_ID",
    "EXPENSE_ID",
    "IE_TYPES",
]
