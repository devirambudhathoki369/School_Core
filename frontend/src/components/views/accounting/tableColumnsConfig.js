const COMMON_TCs = [
    ["voucher_id", "voucher id"], ["date"], ["narration", "Narration"]
];

const INCOME_ENTRIES_TCs = [
    ...COMMON_TCs, ["mode_text", "Payment mode"],
];

const EXPENSE_ENTRIES_TCs = [
    ...COMMON_TCs, ["mode_text", "Payment mode"],
];

const JOURNAL_ENTRIES_TCs = [
    ...COMMON_TCs,
];

const CONTRA_ENTRIES_TCs = [
    ...COMMON_TCs,
];

export { INCOME_ENTRIES_TCs, EXPENSE_ENTRIES_TCs, JOURNAL_ENTRIES_TCs, CONTRA_ENTRIES_TCs };