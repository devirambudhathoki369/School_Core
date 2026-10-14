// Completed years between a BS birth date and today's BS date (both
// "YYYY-MM-DD"). The API sends no age, so every list that shows an Age column
// works it out here. Blank when either date is missing or the birth date is
// in the future.
export function calculateBSAge(birthDateBS, todayBS) {
    if (!birthDateBS || !todayBS) return '';
    const [by, bm, bd] = String(birthDateBS).split('-').map(n => parseInt(n));
    const [ty, tm, td] = String(todayBS).split('-').map(n => parseInt(n));
    if (!by || !ty) return '';
    let age = ty - by;
    if (tm < bm || (tm === bm && td < bd)) age -= 1;
    return age >= 0 ? age : '';
}
