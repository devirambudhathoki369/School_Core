// these values come from create_ledger or ledger_groups files!;
const MAJOR_LEDGER_GROUPS = {
    DEBIT: 1,
    CREDIT: 2,
    CASH_IN_HAND: 7,
    BANK: 3,
    DIRECT_EXPENSE: 10,
    INDIRECT_EXPENSE: 14,
    DIRECT_INCOME: 11,
    INDIRECT_INCOME: 15,
    // these 1&2 are from AccountingPaymentMethods.jsx
    1: 7, // 1: cash 
    2: 3,// 2: bank 
};

const ENTRIES = {
    INCOME: {
        ID: 1,
        name: "Income Voucher",
        apiPath: "/accounting/income_entry",
        pagePath: "#accounting.income-entry",
        tag: "INV",
    },
    EXPENSE: {
        ID: 2,
        name: "Expense Voucher",
        apiPath: "/accounting/expense_entry",
        pagePath: "#accounting.expense-entry",
        tag: "EXV",
    },
    JOURNAL: {
        ID: 3,
        name: "Journal Voucher",
        apiPath: "/accounting/journal_entry",
        pagePath: "#accounting.journal-entry",
        tag: "JRV",
    },
    CONTRA: {
        ID: 4,
        name: "Contra Voucher",
        apiPath: "/accounting/contra_entry",
        pagePath: "#accounting.contra-entry",
        tag: null,
    },
};

const DEBIT = 1, CREDIT = 2;
const LEDGER_GROUP_SPLIT = {
    [ENTRIES.INCOME.ID]: {
        // ledger-group-id : debit/credit id
        [MAJOR_LEDGER_GROUPS.BANK]: DEBIT,
        [MAJOR_LEDGER_GROUPS.CASH_IN_HAND]: DEBIT,
        [MAJOR_LEDGER_GROUPS.DIRECT_INCOME]: CREDIT,
        [MAJOR_LEDGER_GROUPS.INDIRECT_INCOME]: CREDIT,
    },
    [ENTRIES.EXPENSE.ID]: {
        [MAJOR_LEDGER_GROUPS.BANK]: CREDIT,
        [MAJOR_LEDGER_GROUPS.CASH_IN_HAND]: CREDIT,
        [MAJOR_LEDGER_GROUPS.DIRECT_EXPENSE]: DEBIT,
        [MAJOR_LEDGER_GROUPS.INDIRECT_EXPENSE]: DEBIT,
    },
}

export {
    ENTRIES, MAJOR_LEDGER_GROUPS, LEDGER_GROUP_SPLIT,
    DEBIT, CREDIT,
};