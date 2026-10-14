const BALANCE_TYPES = {
    DEBIT: { value: 1, name: "debit" },
    CREDIT: { value: 2, name: "credit" },
};
const BALANCE_TYPES_NAME = Object.values(BALANCE_TYPES).reduce((acc, blc) => {
    acc[blc.value] = blc.name;
    return acc;
}, {});

const LEDGER_GROUP_CATEGORIES = {
    INCOME: { value: 1, name: "income" },
    EXPENSE: { value: 2, name: "expense" },
    ASSET: { value: 3, name: "asset" },
    LIABILITY: { value: 4, name: "liability" },
    EQUITY: { value: 5, name: "equity" },
};
const CASH_FLOW_CATEGORIES = {
    OPERATING: { value: 1, name: "operating" },
    INVESTING: { value: 2, name: "investing" },
    FINANCING: { value: 3, name: "financing" },
};

const BALANCE_TYPES_OPTIONS = [
    { name: "Dr.", value: BALANCE_TYPES.DEBIT.value },
    { name: "Cr.", value: BALANCE_TYPES.CREDIT.value },
]; // from accounting.models.AccountingLedger.py > BALANCE_TYPE_CHOICES;

const LEDGER_GROUPS_OPTIONS = [
    { value: 1, name: "Account Payable", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 2, name: "Account Receivable", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 3, name: "Bank Account", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: null },
    { value: 4, name: "Bank Occ Account", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: null },
    { value: 5, name: "Bank OD Account", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: null },
    { value: 6, name: "Capital A/C", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.EQUITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 7, name: "Cash in Hand", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: null },
    { value: 8, name: "Current Assets", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 9, name: "Current Liabilities", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 10, name: "Direct Expenses", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EXPENSE, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 11, name: "Direct Income", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.INCOME, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 12, name: "Duties and Tax", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EXPENSE, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 13, name: "Fix Assets", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.INVESTING },
    { value: 14, name: "Indirect Expenses", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EXPENSE, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 15, name: "Indirect Income", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.INCOME, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 16, name: "Investment", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.INVESTING },
    { value: 17, name: "Loan and Advance", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.INVESTING },
    { value: 18, name: "Loans", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 19, name: "Provision", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 20, name: "Purchase", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EXPENSE, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 21, name: "Sales", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.INCOME, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 22, name: "Mics, Expenses (assets)", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EXPENSE, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 23, name: "Reserve and surplus", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.EQUITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 24, name: "Retained Earning", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.EQUITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 25, name: "Stock in Hand (closing stock)", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 26, name: "Sundry Creditors", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 27, name: "Sundry Debtors", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 28, name: "Suspense A/C", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: null },
    { value: 29, name: "Unsecured Loan", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 30, name: "Stock in Hand (opening stock)", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.ASSET, flow: CASH_FLOW_CATEGORIES.OPERATING },
    { value: 31, name: "Secured Loan", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 32, name: "Bonus Share", type: BALANCE_TYPES.DEBIT, group: LEDGER_GROUP_CATEGORIES.EQUITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 33, name: "Short Term Loan", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.LIABILITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
    { value: 34, name: "Share Capital", type: BALANCE_TYPES.CREDIT, group: LEDGER_GROUP_CATEGORIES.EQUITY, flow: CASH_FLOW_CATEGORIES.FINANCING },
];

const MAPPED_LEDGER_GROUPS = LEDGER_GROUPS_OPTIONS.reduce((acc, lg) => {
    acc[lg.value] = lg;
    return acc;
}, {});

const RETAINED_EARNING_GROUP = 24;


export {
    BALANCE_TYPES_OPTIONS, LEDGER_GROUPS_OPTIONS, MAPPED_LEDGER_GROUPS,
    BALANCE_TYPES, BALANCE_TYPES_NAME, LEDGER_GROUP_CATEGORIES, RETAINED_EARNING_GROUP,
};