import { __fetch, __fetchAsOptions, __save, __update } from "..";

const AEY_PATH = "/accounting/economic_year";

export function saveAccountingEconomicYear(data) {
    if (data?.id) return __update(AEY_PATH, data);
    return __save(AEY_PATH, data);
}

// `closed`: omit for the running years only (the default everywhere), or pass
// 'all' to get open AND closed ones — what a year LIST wants to show.
export function getAccountingEconomicYears(school_id, as_options = '', closed = '') {
    const params = closed ? { school: school_id, closed } : { school: school_id };
    if (as_options) return __fetchAsOptions(AEY_PATH, params, { name: 'name' });
    return __fetch(AEY_PATH, params);
}

// closed (past) accounting economic years — needed so past fiscal years can be
// selected for viewing reports / transaction history (they are read-only).
export function getClosedAccountingEconomicYears(school_id) {
    return __fetch(AEY_PATH, { school: school_id, closed: true });
}