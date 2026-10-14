import { __fetch, __update } from ".";

const PUBLIC = "/api/school-education-levels";
const MANAGE = "/api/manage/school-education-levels";

// module cache: schoolId -> Promise<number[]> of hidden level ids, so the
// pickers don't refetch on every mount.
const _cache = {};

// Hidden education-level ids for a school (used by class/level pickers).
export async function getHiddenEducationLevels(school) {
    if (!school) return [];
    if (!_cache[school]) {
        _cache[school] = (async () => {
            const data = await __fetch(PUBLIC, { school });
            return Array.isArray(data?.hidden) ? data.hidden : [];
        })();
    }
    return _cache[school];
}

// superadmin: read + replace a school's hidden set
export async function getManagedHiddenLevels(school) {
    const data = await __fetch(MANAGE, { school });
    return Array.isArray(data?.hidden) ? data.hidden : [];
}
export async function setHiddenEducationLevels(school, hidden) {
    delete _cache[school]; // invalidate the picker cache after a change
    return __update(MANAGE, { school, hidden }, false);
}
