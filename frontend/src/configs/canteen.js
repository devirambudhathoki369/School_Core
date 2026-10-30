/**
 * MUST MATCH smsys.backend/canteen/constants.py.
 *
 * These numbers cross the wire in both directions. When you change one file,
 * change the other.
 */
import { PERMISSIONS } from "./permissions";


export const BUYER_STUDENT = 1;
export const BUYER_STAFF = 2;
export const BUYER_WALKIN = 3;
export const BUYER_TYPES = [
    { value: BUYER_STUDENT, name: "Student" },
    { value: BUYER_STAFF, name: "Staff" },
    { value: BUYER_WALKIN, name: "Walk-in" },
];

// CASH is money over the counter; ACCOUNT is the buyer's canteen account
// (a prepaid balance, or credit up to its limit where the school allows it).
export const PAY_CASH = 1;
export const PAY_ACCOUNT = 2;
// A meal already paid for by a monthly use type: served and counted, nothing
// charged at the counter (the month's canteen posting carries the money).
export const PAY_PLAN = 3;
export const PAYMENTS = [
    { value: PAY_CASH, name: "Cash" },
    { value: PAY_ACCOUNT, name: "Account" },
    { value: PAY_PLAN, name: "Monthly plan" },
];

// Use types — how a student uses the canteen.
export const PLAN_MONTHLY = 1;
export const PLAN_PER_USE = 2;
export const PLAN_KINDS = [
    { value: PLAN_MONTHLY, name: "Monthly (posted every month)" },
    { value: PLAN_PER_USE, name: "Cash or due (paid when taken)" },
];

export const MONTHS = ["Baisakh", "Jestha", "Ashad", "Shrawan", "Bhadra", "Ashoj", "Kartik", "Mangsir",
    "Poush", "Magh", "Falgun", "Chaitra"].map((name, i) => ({ value: i + 1, name }));

// The canteen's own ledger: a payment (receipt), a counter purchase on the
// account, a refund, and the month's posting for a regular user.
export const TXN_TOPUP = 1;
export const TXN_PURCHASE = 2;
export const TXN_REFUND = 3;
export const TXN_POSTING = 6;

// The same four a student receipt offers, with the same numbers.
export const MODES = [
    { value: 1, name: "Cash" },
    { value: 2, name: "Bank" },
    { value: 3, name: "Cheque" },
    { value: 4, name: "Wallet" },
];

export const FOOD_TYPES = [
    { value: 0, name: "Not applicable" },
    { value: 1, name: "Veg" },
    { value: 2, name: "Non-veg" },
];

export const SLIP_WIDTHS = [
    { value: 80, name: "80 mm slip printer" },
    { value: 58, name: "58 mm slip printer" },
    { value: 0, name: "A4 / A5 paper" },
];

// At most this many of one item on a sale (the server refuses more).
export const MAX_QTY = 99;

export function nameOf(options, value, fallback = "—") {
    return options.find((o) => String(o.value) === String(value))?.name || fallback;
}

// The canteen's pages, as a canteen user (or a member of staff) is given them.
// The numbers are PERMISSIONS.CANTEEN's and the backend's PAGE_*.
export const CANTEEN_PAGES = [
    { value: PERMISSIONS.CANTEEN.COUNTER, name: "Counter", hint: "Ring up sales, void today's mistakes" },
    { value: PERMISSIONS.CANTEEN.ITEMS, name: "Items & Rates", hint: "Items, prices, class-wise monthly rates" },
    { value: PERMISSIONS.CANTEEN.USE_TYPES, name: "Use Types", hint: "Day care, tiffin monthly; who is on each" },
    { value: PERMISSIONS.CANTEEN.MONTHLY_POSTING, name: "Monthly Posting", hint: "Post the months' charges to regular users" },
    { value: PERMISSIONS.CANTEEN.COLLECT, name: "Collect & Receipt", hint: "Collect dues item-wise, print receipts" },
    { value: PERMISSIONS.CANTEEN.ACCOUNTS, name: "Card Accounts", hint: "Top-ups, refunds, limits, blocked cards" },
    { value: PERMISSIONS.CANTEEN.REPORTS, name: "Canteen Reports", hint: "Sales, dues, postings, meal count" },
    { value: PERMISSIONS.CANTEEN.SETUP, name: "Canteen Setup", hint: "How buyers pay, limits, the slip" },
    { value: PERMISSIONS.CANTEEN.USERS, name: "Canteen Users", hint: "Add canteen users, with pages they hold" },
];
