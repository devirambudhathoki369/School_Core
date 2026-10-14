/**
 * MUST MATCH smsys.backend/extra_billing/constants.py.
 *
 * These numbers cross the wire in both directions — a value that means "shop"
 * in the database and "canteen" on screen is the kind of bug only ever found
 * in a rent dispute. When you change one file, change the other.
 */

export const PARTY_TENANT = 1;
export const PARTY_TYPES = [
    { value: 1, name: "Tenant" },
    { value: 2, name: "Shop / shutter" },
    { value: 3, name: "Canteen / cafeteria" },
    { value: 4, name: "Institution / office" },
    { value: 5, name: "Staff quarter" },
    { value: 6, name: "Other" },
];

// The same four a student receipt offers, with the same numbers.
export const PAYMENT_MODES = [
    { value: 1, name: "Cash" },
    { value: 2, name: "Bank" },
    { value: 3, name: "Cheque" },
    { value: 4, name: "Wallet" },
];

// Reserved key inside a `details` blob: the snapshot of each title's name at
// write time. Not a real title, so every iterator over `details` must skip it.
export const TITLE_NAMES_KEY = "__titles";
// The pseudo-title carrying what a party already owed when they were entered.
export const OPENING_DUE = "od";

export function nameOf(options, value, fallback = "—") {
    return options.find((o) => String(o.value) === String(value))?.name || fallback;
}
