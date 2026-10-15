/**
 * PER-SCHOOL MODULES, and the one place that decides whether a school has one.
 *
 * A module is a whole branch of the product a school is granted (or not) by the
 * superadmin — on the school form (Setup > School/Admin) when the school is
 * added or edited. A PERMISSION is a different question — what one member of
 * staff may do inside a branch their school already has. Conflating the two is
 * how you end up granting a school a feature by ticking a box on one staff
 * member, so they stay two mechanisms.
 *
 * Each entry maps a view path — a top-level menu `view` ("payroll") or one page
 * under another menu ("manage.extra-activities-setup") — to the profile flag
 * that must be true for the school to have it. The flags ride along with the
 * sign-in payload (`user.profile`), so the rail is drawn correctly on first
 * paint rather than appearing a beat later. The backend keeps the same list
 * (main/constants/school_modules.py); keep the two in step.
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
 * backend refuses every endpoint of a module the school does not have
 * (SecuredAPIView.enforce_school_modules, and the hostel / extra-billing gates).
 * This is what makes the app honest about what a school has; the server is what
 * makes it safe.
 */

/**
 * The facilities a superadmin can give a school, in the order the school form
 * lists them. `on`: ticked for a new school until the superadmin says otherwise
 * (every school has always had the first five; the last two are sold apart).
 */
export const SCHOOL_MODULES = [
    { flag: 'uses_exams', label: 'Exams & results', on: true,
        hint: 'Exams, schedules, marks entry, results, seat plans and character certificates.' },
    { flag: 'uses_payroll', label: 'Payroll', on: true,
        hint: 'Salary posting, staff payments, pay slips and salary sheets.' },
    { flag: 'uses_accounting', label: 'Accounting', on: true,
        hint: 'Ledgers, income/expense/journal entries and the books (trial balance, P&L, balance sheet).' },
    { flag: 'uses_library', label: 'Library', on: true,
        hint: 'Books, bar codes, issue/return and library reports.' },
    { flag: 'uses_inventory', label: 'Inventory', on: true,
        hint: 'Items, purchases, issues, wastage and stock reports.' },
    { flag: 'uses_hostel', label: 'Hostel', on: false,
        hint: 'Residents, rooms and beds, roll call, gate passes, mess and hostel billing.' },
    { flag: 'uses_extra_billing', label: 'Extra billing', on: false,
        hint: 'Bills and receipts for people who are not students — tenants, contractors.' },
];

export const MODULE_GATES = {
    // Exams — and the extra activities set up under Manage, which exist only to
    // be entered against an exam's results.
    exams: 'uses_exams',
    'manage.extra-activities-setup': 'uses_exams',
    // Payroll — salary posting, staff payments, pay slips, salary sheets.
    payroll: 'uses_payroll',
    // Accounting — the school's books.
    accounting: 'uses_accounting',
    library: 'uses_library',
    inventory: 'uses_inventory',
    // Hostel — residents, rooms, roll call, gate passes, mess, hostel billing.
    hostel: 'uses_hostel',
    // Extra billing — bills, receipts and dues for people who are NOT students
    // (shutter tenants, canteen contractors, offices renting school property).
    // Student billing is a different branch entirely and is never gated on this.
    'extra-billing': 'uses_extra_billing',
};

/**
 * Staff permissions belonging to a module, so the Permissions tab offers none
 * for a module the school does not have: whole categories of `configs/
 * permissions`, and payroll's ids inside STAFF (the rest of STAFF is enrolment).
 */
export const PERMISSION_CATEGORY_GATES = {
    EXAM: 'uses_exams',
    ACCOUNTING: 'uses_accounting',
    LIBRARY: 'uses_library',
    INVENTORY: 'uses_inventory',
    HOSTEL: 'uses_hostel',
    EXTRA_BILLING: 'uses_extra_billing',
};
export const PERMISSION_ID_GATES = {
    // STAFF: payment, salary posting, ledger/invoice deletion, pay slips, salary sheet
    203: 'uses_payroll', 204: 'uses_payroll', 209: 'uses_payroll',
    210: 'uses_payroll', 211: 'uses_payroll', 212: 'uses_payroll',
    // MANAGE: extra activities setup
    508: 'uses_exams',
};

/** The flag a view path needs: its own entry, else the nearest enclosing one. */
function gateOf(viewPath) {
    const parts = String(viewPath || '').split('.');
    for (let end = parts.length; end > 0; end--) {
        const flag = MODULE_GATES[parts.slice(0, end).join('.')];
        if (flag) return flag;
    }
    return null;
}

/** Does this school have the module that owns `viewPath` ("hostel.rooms")? */
export function moduleAllowed(viewPath, profile) {
    const flag = gateOf(viewPath);
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
    const off = Object.values(MODULE_GATES).some(flag => !profile?.[flag]);
    if (!off) return views;
    return Object.entries(views || {}).reduce((acc, [path, view]) => {
        if (moduleAllowed(path, profile)) acc[path] = view;
        return acc;
    }, {});
}

/** May the Permissions tab offer this permission, given the school's modules? */
export function permissionAllowed(category, id, profile) {
    const flag = PERMISSION_CATEGORY_GATES[category] || PERMISSION_ID_GATES[id];
    return !flag || Boolean(profile?.[flag]);
}
