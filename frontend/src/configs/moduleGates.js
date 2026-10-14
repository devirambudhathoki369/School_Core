/**
 * PER-SCHOOL MODULES, and the one place that decides whether a school has one.
 *
 * A module is a whole branch of the product a school is granted (or not) by the
 * superadmin. A PERMISSION is a different question — what one member of staff
 * may do inside a branch their school already has. Conflating the two is how
 * you end up granting a school a feature by ticking a box on one staff member,
 * so they stay two mechanisms.
 *
 * Each entry maps a top-level menu `view` to the profile flag that must be true
 * for the school to have it. The flag rides along with the sign-in payload
 * (`user.profile`), so the rail is drawn correctly on first paint rather than
 * appearing a beat later.
 *
 * BOTH HALVES ARE GATED, and that is the point:
 *
 *   · the MENU — `filterMenuByProfileFlags` in AppContext drops the branch, so
 *     the school never sees it;
 *   · the VIEW MAP — `filterViewsByModules` drops every page under it, so
 *     typing `#hostel.setup` into the address bar resolves to nothing.
 *
 * Hiding a menu row alone is decoration: `configs/views/admin.jsx` hands a
 * school admin the ENTIRE view map regardless of permissions, so an un-listed
 * page is still one URL away. Neither half is the real protection either — the
 * backend refuses every `/hostel/*` request from a school without the module
 * (`hostel/views/BaseViews.HostelBaseView`). This is what makes the app honest
 * about what a school has; the server is what makes it safe.
 */

export const MODULE_GATES = {
    // Hostel — residents, rooms, roll call, gate passes, mess, hostel billing.
    hostel: 'uses_hostel',
    // Extra billing — bills, receipts and dues for people who are NOT students
    // (shutter tenants, canteen contractors, offices renting school property).
    // Student billing is a different branch entirely and is never gated on this.
    'extra-billing': 'uses_extra_billing',
};

/** Does this school have the module that owns `viewPath` ("hostel.rooms")? */
export function moduleAllowed(viewPath, profile) {
    const root = String(viewPath || '').split('.')[0];
    const flag = MODULE_GATES[root];
    if (!flag) return true;      // not a gated module — everything else
    return Boolean(profile?.[flag]);
}

/**
 * Drop every view belonging to a module this school does not have.
 *
 * Returns the SAME object when nothing is gated off, so the common case costs
 * one comparison and no allocation.
 */
export function filterViewsByModules(views, profile) {
    const off = Object.entries(MODULE_GATES)
        .filter(([, flag]) => !profile?.[flag])
        .map(([root]) => root);
    if (off.length < 1) return views;
    return Object.entries(views || {}).reduce((acc, [path, view]) => {
        if (!off.includes(path.split('.')[0])) acc[path] = view;
        return acc;
    }, {});
}
