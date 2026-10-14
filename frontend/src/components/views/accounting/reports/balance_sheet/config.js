import { LEDGER_GROUPS_OPTIONS, LEDGER_GROUP_CATEGORIES } from "../../ledger_groups";

const BALANCE_SHEET_GROUPS = [LEDGER_GROUP_CATEGORIES.LIABILITY, LEDGER_GROUP_CATEGORIES.EQUITY, LEDGER_GROUP_CATEGORIES.ASSET];
const BALANCE_SHEET_GROUP_CATEGORIES = LEDGER_GROUPS_OPTIONS.reduce((acc, lg) => {
    let group = lg.group;
    if (BALANCE_SHEET_GROUPS.includes(group)) {
        group = group.name;
        try {
            acc[group].push(lg.value);
        } catch (e) {
            acc[group] = [lg.value];
        }
    }
    return acc;
}, {});

// Groups printed WITH their sign instead of as a magnitude.
//
// Every other row sits on the side its category dictates, so the column already
// says what the sign would. A Suspense A/C is the exception: it is the account
// that exists precisely to hold a difference nobody has explained yet, and
// whether that difference is a debit or a credit is the most useful thing on
// the row. Math.abs() would throw that away.
const SIGNED_LEDGER_GROUPS = new Set([28]); // Suspense A/C

export { BALANCE_SHEET_GROUPS, BALANCE_SHEET_GROUP_CATEGORIES, SIGNED_LEDGER_GROUPS }