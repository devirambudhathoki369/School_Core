import { __fetch, __save, __update, __delete } from ".";

const CATEGORIES = "/api/inventory/categories";
const ITEMS = "/api/inventory/items";
const TRANSACTIONS = "/api/inventory/transactions";
const REPORT = "/api/inventory/report";

// --- categories ---
export async function getInventoryCategories(school) {
    return __fetch(CATEGORIES, { school });
}
export async function saveInventoryCategory(data) {
    return data?.id ? __update(CATEGORIES, data, false) : __save(CATEGORIES, data, false);
}
export async function deleteInventoryCategory(school, id) {
    return __delete(CATEGORIES, { school, id });
}

// --- items (GET includes derived current stock) ---
export async function getInventoryItems(school) {
    return __fetch(ITEMS, { school });
}
export async function saveInventoryItem(data) {
    return data?.id ? __update(ITEMS, data, false) : __save(ITEMS, data, false);
}
export async function deleteInventoryItem(school, id) {
    return __delete(ITEMS, { school, id });
}

// --- transactions (purchase / issue / adjustment) ---
export async function getInventoryTransactions(params) {
    return __fetch(TRANSACTIONS, params);
}
export async function saveInventoryTransaction(data) {
    return data?.id ? __update(TRANSACTIONS, data, false) : __save(TRANSACTIONS, data, false);
}
export async function deleteInventoryTransaction(school, id) {
    return __delete(TRANSACTIONS, { school, id });
}

// --- report (academic-year / date scoped) ---
export async function getInventoryReport(params) {
    return __fetch(REPORT, params);
}

export const INV_TXN = { PURCHASE: 1, ISSUE: 2, ADJUSTMENT: 3, WASTAGE: 4 };
export const INV_TXN_LABEL = { 1: "Purchase", 2: "Issue", 3: "Adjustment", 4: "Wastage" };
