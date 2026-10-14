// must match backend/main/constants/payroll.py
import { CARRY_FORWARD_OUT, OPENING_BALANCE } from "./payment";

// The two lines a payroll year-close writes for a member of staff who is still
// owed money: `cfo` takes the balance out of the year that closed, `ob` brings
// it into the next one. Neither is an earning, so neither has a rate.
const CARRY_TITLES = [OPENING_BALANCE, CARRY_FORWARD_OUT];

const TITLE_LABELS = {
    [OPENING_BALANCE]: "Old dues",
    [CARRY_FORWARD_OUT]: "Carried forward",
};

// What a payroll title is called on screen and on paper. The earning titles
// (salary, funds, grade, allowance, extra) print as they are.
function payrollTitle(title) {
    return TITLE_LABELS[title] || title;
}

// MUST MATCH backend/main/models/Staff.STAFF_STATUS_CHOICES (1 = employed).
const NOT_WORKING = { 2: "departed", 3: "retired", 4: "on leave" };

// The payroll pickers list the working staff, and with them anyone who is not
// working at the school now but still holds a balance: somebody who left with
// salary unpaid is owed it all the same. Those names say so.
function payrollStaffName(staff) {
    const tag = NOT_WORKING[staff?.status];
    return tag ? `${staff?.name} (${tag})` : staff?.name;
}

export { CARRY_TITLES, payrollTitle, payrollStaffName };
