import { __fetch, __fetchAsOptions, __save, __search, __update } from ".";

// STAFF-ROLES
const STAFF_ROLES_API = "/api/staffs/roles";

export async function fetchStaffRoles(as_options = '') {
    if (as_options) return __fetchAsOptions(STAFF_ROLES_API, {}, {
        name: 'role'
    }, {});
    return __fetch(STAFF_ROLES_API, {}, {});
}

export async function saveStaffRole(data) {
    return __save(STAFF_ROLES_API, data);
}

// --- STAFF
const STAFFS_API = "/api/staffs";
export async function fetchStaffs(school_id, as_options = '', with_accounts_only = '') {
    if (as_options) return __fetchAsOptions(STAFFS_API, { school: school_id, as_options, with_accounts_only }, { name: 'name' }, {});
    return __fetch(STAFFS_API, { school: school_id, with_accounts_only });
}
export async function getStaffDetails(staff_id, school_id, include_account = '') {
    const data = await __fetch(STAFFS_API, { staff: staff_id, school: school_id, include_account });
    return data?.first_name ? data : null;
}

export async function saveStaff(data) {
    let staff_id;
    try {
        // get staff-id from json else form-data!
        staff_id = data?.id || data.get("id");
    } catch (error) { }
    if (staff_id) return __update(STAFFS_API, data, false);
    return __save(STAFFS_API, data);
}

/** Take a staff member's profile photo off the record. */
export async function removeStaffImage(staff_id, school_id, name = "image") {
    return __update(STAFFS_API, { id: staff_id, school: school_id, remove: name });
}

export async function searchStaffs(params) {
    return __search("/api/search/staffs", {
        ...params
    });
}