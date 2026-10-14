import Users from "@/configs/Users";

/**
 * Schools that are held out of the portal.
 *
 * A signed-in user whose school is on this list never reaches the app: the
 * portal sends them to `/server_error`, which offers nothing but a way to sign
 * out. Everyone else is untouched — this is a per-school hold, not maintenance
 * mode (`src/middleware.js`), which takes the whole site down for everybody.
 *
 * Lifting a hold is a one-line edit: take the id out of the list below.
 */
export const BLOCKED_SCHOOL_IDS = [
    // Empty: nobody is held. Little Valley Balvatika (26) was released on
    // 2026-09-02 and signs in normally again.
];

/**
 * Which school does this signed-in user belong to?
 *
 * The three profile shapes disagree on where the school id lives, and reading
 * the wrong key silently holds the wrong people — `id` on a STAFF profile is
 * the staff member, not their school. So:
 *   admin   → the profile IS the school row, `id` is the school id
 *   staff   → `school_id`
 *   student → `school`
 * Superadmin has no school at all, and is never held.
 */
export function schoolIdOf(user) {
    const profile = user?.profile;
    if (!profile || user?.role === Users.SUPERADMIN) return null;
    const id = user?.role === Users.ADMIN
        ? profile.id
        : (profile.school_id ?? profile.school);
    const schoolId = Number(id);
    return Number.isInteger(schoolId) && schoolId > 0 ? schoolId : null;
}

export function isSchoolBlocked(user) {
    const schoolId = schoolIdOf(user);
    return schoolId !== null && BLOCKED_SCHOOL_IDS.includes(schoolId);
}
