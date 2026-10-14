import { __fetch } from "..";

export async function getSummary(school, economic_year) {
    return __fetch('/api/dashboard', { school, economic_year });
}

// Today's present/absent headcount (students + staff). Live, uncached.
export async function getAttendanceToday(school) {
    return __fetch('/api/dashboard/attendance-today', { school });
}
