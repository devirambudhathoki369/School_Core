/**
 * Canteen API — the counter, the items, the card accounts and their records.
 *
 * Every call goes to `/canteen/*`, which the backend refuses outright for a
 * school that has not been granted the module (403 with a message the UI shows
 * as-is). Nothing here checks the flag first: a client-side check that has to
 * be remembered at twenty call sites is one that will be forgotten at one.
 */
import { __fetch, __save, __update } from ".";
import server from "../server";

const API = {
    settings: "/canteen/settings",
    categories: "/canteen/categories",
    items: "/canteen/items",
    buyers: "/canteen/buyers",
    sales: "/canteen/sales",
    accounts: "/canteen/accounts",
    receipts: "/canteen/receipts",
    plans: "/canteen/plans",
    enrollments: "/canteen/enrollments",
    monthlyPosting: "/canteen/monthly-posting",
    classRates: "/canteen/class-rates",
    classes: "/canteen/classes",
    reports: "/canteen/reports",
    access: "/canteen/manage/access",
    users: "/canteen/users",
    myPassword: "/canteen/my-password",
};

// A GET that failed returns an error object, not a list.
const asList = (data) => (Array.isArray(data) ? data : []);

// Not `__delete`: that asks a generic "Delete this record?" of its own, and the
// page has already asked the specific question. One question per action.
async function removeOne(path, params) {
    try {
        const res = await server.delete(path, { params });
        return [res?.status || 200, res.data?.message, res.data];
    } catch (e) {
        return [e?.response?.status || 400, e?.response?.data?.message || e?.response?.data?.detail || e.message, null];
    }
}

// A ring-up must reach the server exactly as built: `__save` drops empty
// fields and folds identical in-flight requests together, and a sale is
// already protected against doubles by its own `client_key`.
async function postRaw(path, data) {
    try {
        const res = await server.post(path, data);
        return [res?.status || 200, res.data?.message, res.data];
    } catch (e) {
        // 0 = no answer at all (the connection dropped). The caller keeps its
        // ring-up key for that case, so a retry cannot charge twice.
        return [e?.response ? e.response.status : 0,
            e?.response?.data?.message || e?.response?.data?.detail || e.message, e?.response?.data || null];
    }
}

/* ----------------------------------------------------------------- settings */
export async function getCanteenSettings(school) {
    return __fetch(API.settings, { school });
}
export async function saveCanteenSettings(data) {
    // Not cleaned: `false` and `0` are real answers here.
    return __update(API.settings, data, false);
}

/* --------------------------------------------------------- categories/items */
export async function getCategories(school) {
    return asList(await __fetch(API.categories, { school }));
}
export async function saveCategory(data) {
    return data?.id ? __update(API.categories, data) : __save(API.categories, data);
}
export async function deleteCategory(school, id) {
    return removeOne(API.categories, { school, id });
}
export async function getItems(school, available = false) {
    return asList(await __fetch(API.items, { school, available: available ? 1 : undefined }));
}
export async function saveItem(data) {
    return data?.id ? __update(API.items, data, false) : __save(API.items, data, false);
}
export async function setItemAvailable(school, id, is_available) {
    return __update(API.items, { school, id, is_available }, false);
}
export async function deleteItem(school, id) {
    return removeOne(API.items, { school, id });
}

/* ------------------------------------------------------------------ counter */
export async function findBuyers(school, { q, card, type } = {}) {
    const data = await __fetch(API.buyers, { school, q: q || undefined, card: card || undefined, type: type || undefined });
    return { buyers: asList(data?.buyers), byCard: !!data?.by_card };
}
export async function ringUp(data) {
    return postRaw(API.sales, data);
}
export async function getSale(school, id) {
    return __fetch(API.sales, { school, id });
}
export async function getDaySales(school, date) {
    const data = await __fetch(API.sales, { school, date: date || undefined });
    return asList(data?.sales);
}
export async function voidSale(school, id, remarks) {
    return removeOne(API.sales, { school, id, remarks });
}

/* ----------------------------------------------------------------- accounts */
export async function getAccounts(school, filter) {
    return asList(await __fetch(API.accounts, { school, filter: filter || undefined }));
}
export async function getAccount(school, id) {
    return __fetch(API.accounts, { school, id });
}
export async function moveMoney(data) {
    return postRaw(API.accounts, data);
}
export async function saveAccount(data) {
    // Not cleaned: a blank limit means "back to the school's default".
    return __update(API.accounts, data, false);
}
export async function voidOfficeReceipt(school, txn, remarks) {
    return removeOne(API.accounts, { school, txn, remarks });
}
export async function getOfficeReceipt(school, id) {
    return __fetch(API.receipts, { school, id });
}

/* ---------------------------------------------------------------- use types */
export async function getPlans(school) {
    return asList(await __fetch(API.plans, { school }));
}
export async function savePlan(data) {
    return data?.id ? __update(API.plans, data, false) : postRaw(API.plans, data);
}
export async function addStandardPlans(school) {
    return postRaw(API.plans, { school, standard: true });
}
export async function deletePlan(school, id) {
    return removeOne(API.plans, { school, id });
}
export async function getEnrollments(school, plan, ended = false) {
    return __fetch(API.enrollments, { school, plan, ended: ended ? 1 : undefined });
}
// A class as the canteen keys it (`/canteen/classes`): the grade, with every
// section and stream of it.
export async function getEnrollmentCandidates(school, plan, class_key) {
    return asList(await __fetch(API.enrollments, { school, plan, class_key }));
}
export async function enrollStudents(data) {
    return postRaw(API.enrollments, data);
}
export async function saveEnrollment(data) {
    return __update(API.enrollments, data, false);
}
export async function stopEnrollment(school, id, ended_on) {
    return removeOne(API.enrollments, { school, id, ended_on: ended_on || undefined });
}

/* ------------------------------------------------------------ class rates */
export async function getClasses(school) {
    return asList(await __fetch(API.classes, { school }));
}
export async function getClassRates(school, item) {
    return __fetch(API.classRates, { school, item });
}
export async function saveClassRates(school, item, rates) {
    return __update(API.classRates, { school, item, rates }, false);
}

/* ---------------------------------------------------------- monthly posting */
export async function getMonthlyPosting(school, params) {
    return __fetch(API.monthlyPosting, { school, ...params });
}
export async function runMonthlyPosting(data) {
    return postRaw(API.monthlyPosting, data);
}
export async function withdrawMonthlyPosting(school, txn) {
    return removeOne(API.monthlyPosting, { school, txn });
}

/* ------------------------------------------------------------------ records */
export async function getCanteenReport(school, type, params = {}) {
    return __fetch(API.reports, { school, type, ...params });
}

// An app message to every family that owes (in that class), each with their
// own amount. At most one a day per family; the server says who was left out.
export async function sendDuesReminder(school, class_key) {
    return postRaw("/canteen/dues-reminder", { school, class_key: class_key || undefined });
}

/* --------------------------------------------------------------- superadmin */
export async function getCanteenAccess() {
    const data = await __fetch(API.access);
    return { schools: asList(data?.schools), enabled: data?.enabled || 0, total: data?.total || 0 };
}
export async function setCanteenAccess(school, uses_canteen) {
    return __update(API.access, { school, uses_canteen }, false);
}

/* ------------------------------------------------------------ canteen users */
// Sign-ins that open the canteen alone. Sent as typed (`false` is a real
// answer for `is_active`, and an empty list of pages is the server's to refuse).
export async function getCanteenUsers(school) {
    return asList(await __fetch(API.users, { school }));
}
export async function saveCanteenUser(data) {
    return data?.id ? __update(API.users, data, false) : postRaw(API.users, data);
}
export async function changeMyCanteenPassword(data) {
    return __update(API.myPassword, data, false);
}
