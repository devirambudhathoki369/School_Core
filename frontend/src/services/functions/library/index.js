import { __fetch, __save, __update } from "@/services/functions";

// LIBRARY;
const LIB_API = "/library/libraries";
export async function fetchLibraries(school_id, lib_id = '', as_options = '', preferences = '') {
    const params = { school: school_id, id: lib_id, as_options, preferences };
    return __fetch(LIB_API, params);
}

export async function saveLibrary(data, clean = true) {
    if (data?.id) return __update(LIB_API, data, clean);
    return __save(LIB_API, data, clean);
}

// GUEST SCHOOLS — other schools whose students this library may issue books to.
//
// READ ONLY for a school. That access exposes another school's student records,
// so a school cannot grant it to itself: the superadmin assigns it under
// Setup > Library Access, and the school only reads back what it has been given.
const LIB_GUEST_SCHOOLS_API = "/library/guest-schools";
const LIB_ACCESS_API = "/library/manage/guest-schools";

export async function fetchGuestSchools(school_id, as_options = '') {
    return __fetch(LIB_GUEST_SCHOOLS_API, { school: school_id, as_options });
}

// --- superadmin only ---
export async function fetchLibraryAccess() {
    return __fetch(LIB_ACCESS_API, {});
}

export async function saveLibraryAccess(school, guest_schools) {
    return __update(LIB_ACCESS_API, { school, guest_schools }, false);
}