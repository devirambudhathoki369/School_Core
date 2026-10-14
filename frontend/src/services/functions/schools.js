import { __fetch, __fetchAsOptions, __save, __update } from ".";

const SCHOOLS_API = "/api/schools";

export async function fetchSchools(params, as_options = '') {
    if (as_options) return __fetchAsOptions(SCHOOLS_API, { as_options },
        { name: 'name' });
    return __fetch(SCHOOLS_API, params);
}

export async function updateSchool(data) {
    return __update(SCHOOLS_API, data);
}

/** Take one of the school's own pictures (logo, award_logo, sign, …) off its record. */
export async function removeSchoolImage(school_id, name) {
    return __update(SCHOOLS_API, { id: school_id, remove: name });
}

// ---
const SCHOOL_ADMINS_API = "/api/admins";

export async function getSchoolAdmins() {
    return __fetch(SCHOOL_ADMINS_API, {});
}

export async function saveSchoolAdmin(data) {
    if (data?.id) return __update(SCHOOL_ADMINS_API, data);
    return __save(SCHOOL_ADMINS_API, data)
}

export async function applyEconomicYear(economic_year) {
    return __update(SCHOOL_ADMINS_API, { economic_year, apply: true });
}