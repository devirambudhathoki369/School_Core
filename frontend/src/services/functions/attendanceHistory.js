import server from "../server";

const ATTENDANCE_HISTORY_API = "/api/attendance/history";

/**
 * One student's or one staff member's attendance for a BS year.
 *
 * Answers `[ok, data, message]` rather than going through `__fetch`: that
 * helper hands back the error body or `[]` when a request fails, and here a
 * failed request must not be read as "nothing was ever marked".
 */
export async function fetchAttendanceHistory({ school, student, staff, year }) {
    const params = { school };
    if (student) params.student = student;
    else params.staff = staff;
    if (year) params.year = year;
    try {
        const res = await server.get(ATTENDANCE_HISTORY_API, { params });
        return [true, res.data, ""];
    } catch (e) {
        const message = e?.response?.data?.message || e?.response?.data?.detail;
        return [false, null, message || "The attendance could not be loaded."];
    }
}
