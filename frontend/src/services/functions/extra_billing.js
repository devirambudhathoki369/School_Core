/**
 * Extra billing API — the people a school bills who are not students.
 *
 * Every call goes to `/extra-billing/*`, which the backend refuses outright for
 * a school that has not been granted the module (403 with a message the UI
 * shows as-is). Nothing here checks the flag first: a client-side check that
 * has to be remembered at 20 call sites is one that will be forgotten at one.
 */
import { __delete, __fetch, __save, __update } from ".";
import server from "../server";

const API = {
    parties: "/extra-billing/parties",
    charges: "/extra-billing/charges",
    titles: "/extra-billing/titles",
    postings: "/extra-billing/postings",
    payments: "/extra-billing/payments",
    reports: "/extra-billing/reports",
    access: "/extra-billing/manage/access",
};

// A GET that failed returns an error object, not a list. Every list-shaped
// reader funnels through here so a failure renders as "nothing yet" instead of
// crashing a `.map()` several components deep.
const asList = (data) => (Array.isArray(data) ? data : []);

// Not `__delete`: that asks a generic "Delete this record?" of its own, and the
// page has already asked the specific question (who is being removed, and that
// a record carrying money stays). One question per delete.
async function removeOne(path, params) {
    try {
        const res = await server.delete(path, { params });
        return [res?.status || 200, res.data?.message, res.data];
    } catch (e) {
        return [400, e?.response?.data?.message || e?.response?.data?.detail || e.message, null];
    }
}

/* ------------------------------------------------------------------ parties */
export async function getParties(school, as_options = false) {
    return asList(await __fetch(API.parties, { school, as_options: as_options || undefined }));
}
export async function saveParty(data) {
    return data?.id ? __update(API.parties, data) : __save(API.parties, data);
}
export async function deleteParty(school, id) {
    return removeOne(API.parties, { school, id });
}

/* ------------------------------------------------------------------- titles */
export async function getTitles(school, as_options = false) {
    return asList(await __fetch(API.titles, { school, as_options: as_options || undefined }));
}
export async function saveTitle(data) {
    return data?.id ? __update(API.titles, data) : __save(API.titles, data);
}
export async function deleteTitle(school, id) {
    return removeOne(API.titles, { school, id });
}

/* --------------------------------------------------------------- rate card */
export async function getPartyCharges(school, party) {
    if (!party) return [];
    return asList(await __fetch(API.charges, { school, party }));
}
export async function savePartyCharges(school, party, charges) {
    return __save(API.charges, { school, party, charges });
}

/* ------------------------------------------------------------------ billing */
export async function getPostings(school, params = {}) {
    const data = await __fetch(API.postings, { school, ...params });
    return { postings: asList(data?.postings), already_posted: data?.already_posted || {} };
}
export async function raiseBills(data) {
    return __save(API.postings, data);
}
export async function withdrawPosting(school, id) {
    return __delete(API.postings, { school, id });
}

/* ------------------------------------------------------------------ payment */
export async function getPartyAccount(school, party) {
    return __fetch(API.payments, { school, party });
}
export async function getReceipt(school, id) {
    return __fetch(API.payments, { school, id });
}
export async function collectPayment(data) {
    return __save(API.payments, data);
}
export async function voidReceipt(school, id, remarks) {
    return __delete(API.payments, { school, id, remarks });
}

/* ------------------------------------------------------------------ records */
export async function getExtraReport(school, type, params = {}) {
    return __fetch(API.reports, { school, type, ...params });
}

/* --------------------------------------------------------------- superadmin */
export async function getExtraBillingAccess() {
    const data = await __fetch(API.access);
    return { schools: asList(data?.schools), enabled: data?.enabled || 0, total: data?.total || 0 };
}
export async function setExtraBillingAccess(school, uses_extra_billing) {
    return __update(API.access, { school, uses_extra_billing });
}
