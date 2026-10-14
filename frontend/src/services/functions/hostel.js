/**
 * Hostel module API.
 *
 * Every call goes to `/hostel/*`, which the backend refuses outright for a
 * school that has not been granted the module (403 with a message the UI shows
 * as-is). Nothing here checks the flag first: a client-side check that has to
 * be remembered at 30 call sites is a check that will be forgotten at one.
 */
import { __delete, __fetch, __save, __update } from ".";

const API = {
    hostels: "/hostel/hostels",
    blocks: "/hostel/blocks",
    roomTypes: "/hostel/room-types",
    rooms: "/hostel/rooms",
    beds: "/hostel/beds",
    allocations: "/hostel/allocations",
    candidates: "/hostel/allocations/candidates",
    transfer: "/hostel/allocations/transfer",
    checkout: "/hostel/allocations/checkout",
    attendance: "/hostel/attendance",
    leaves: "/hostel/leaves",
    visitors: "/hostel/visitors",
    complaints: "/hostel/complaints",
    mess: "/hostel/mess-menu",
    discipline: "/hostel/discipline",
    dashboard: "/hostel/dashboard",
    reports: "/hostel/reports",
    access: "/hostel/manage/access",
};

// A GET that failed returns an error object, not a list. Every list-shaped
// reader funnels through here so a failure renders as "nothing yet" instead of
// crashing a `.map()` several components deep.
const asList = (data) => (Array.isArray(data) ? data : []);

/* ----------------------------------------------------------------- setup */
export async function getHostels(school, as_options = false) {
    return asList(await __fetch(API.hostels, { school, as_options: as_options || undefined }));
}
export async function saveHostel(data) {
    return data?.id ? __update(API.hostels, data) : __save(API.hostels, data);
}
export async function deleteHostel(school, id) {
    return __delete(API.hostels, { school, id });
}

export async function getBlocks(school, hostel, as_options = false) {
    if (!hostel) return [];
    return asList(await __fetch(API.blocks, { school, hostel, as_options: as_options || undefined }));
}
export async function saveBlock(data) {
    return data?.id ? __update(API.blocks, data) : __save(API.blocks, data);
}
export async function deleteBlock(school, id) {
    return __delete(API.blocks, { school, id });
}

export async function getRoomTypes(school, hostel, as_options = false) {
    if (!hostel) return [];
    return asList(await __fetch(API.roomTypes, { school, hostel, as_options: as_options || undefined }));
}
export async function saveRoomType(data) {
    return data?.id ? __update(API.roomTypes, data) : __save(API.roomTypes, data);
}
export async function deleteRoomType(school, id) {
    return __delete(API.roomTypes, { school, id });
}

export async function getRooms(school, hostel, filters = {}) {
    if (!hostel) return [];
    return asList(await __fetch(API.rooms, { school, hostel, ...filters }));
}
export async function saveRoom(data) {
    return data?.id ? __update(API.rooms, data) : __save(API.rooms, data);
}
export async function deleteRoom(school, id) {
    return __delete(API.rooms, { school, id });
}

export async function getBeds(school, room, filters = {}) {
    if (!room) return [];
    return asList(await __fetch(API.beds, { school, room, ...filters }));
}
export async function saveBed(data) {
    return __save(API.beds, data);
}
export async function deleteBed(school, id) {
    return __delete(API.beds, { school, id });
}

/* ------------------------------------------------------------- residents */
export async function getAllocations(school, filters = {}) {
    return asList(await __fetch(API.allocations, { school, ...filters }));
}
export async function getAdmissionCandidates(school, filters = {}) {
    return asList(await __fetch(API.candidates, { school, ...filters }));
}
/** Admit one student or a whole selection — see the backend's POST docstring. */
export async function admitStudents(data) {
    return __save(API.allocations, data, false);
}
export async function updateAllocation(data) {
    return __update(API.allocations, data, false);
}
export async function transferResident(data) {
    return __save(API.transfer, data, false);
}
export async function checkoutResidents(data) {
    return __save(API.checkout, data, false);
}

/* ------------------------------------------------------------ operations */
export async function getRollCall(school, hostel, date) {
    const data = await __fetch(API.attendance, { school, hostel, date });
    return { date: data?.date || date, residents: asList(data?.residents) };
}
export async function saveRollCall(data) {
    return __save(API.attendance, data, false);
}
export async function getStudentHostelAttendance(school, hostel, student, from, to) {
    return asList(await __fetch(API.attendance, { school, hostel, student, from, to }));
}

export async function getLeaves(school, filters = {}) {
    return asList(await __fetch(API.leaves, { school, ...filters }));
}
export async function saveLeave(data) {
    return data?.id ? __update(API.leaves, data, false) : __save(API.leaves, data);
}
export async function deleteLeave(school, id) {
    return __delete(API.leaves, { school, id });
}

export async function getVisitors(school, filters = {}) {
    return asList(await __fetch(API.visitors, { school, ...filters }));
}
export async function saveVisitor(data) {
    return data?.id ? __update(API.visitors, data, false) : __save(API.visitors, data);
}
export async function deleteVisitor(school, id) {
    return __delete(API.visitors, { school, id });
}

export async function getComplaints(school, filters = {}) {
    return asList(await __fetch(API.complaints, { school, ...filters }));
}
export async function saveComplaint(data) {
    return data?.id ? __update(API.complaints, data, false) : __save(API.complaints, data);
}
export async function deleteComplaint(school, id) {
    return __delete(API.complaints, { school, id });
}

export async function getMessMenu(school, hostel) {
    const data = await __fetch(API.mess, { school, hostel });
    return {
        days: asList(data?.days),
        meals: asList(data?.meals),
        menu: data?.menu && typeof data.menu === "object" ? data.menu : {},
    };
}
export async function saveMessMenu(school, hostel, menu) {
    return __update(API.mess, { school, hostel, menu }, false);
}

export async function getDisciplineRecords(school, filters = {}) {
    return asList(await __fetch(API.discipline, { school, ...filters }));
}
export async function saveDisciplineRecord(data) {
    return data?.id ? __update(API.discipline, data, false) : __save(API.discipline, data);
}
export async function deleteDisciplineRecord(school, id) {
    return __delete(API.discipline, { school, id });
}

/* --------------------------------------------------------------- reports */
export async function getHostelDashboard(school, hostel) {
    const data = await __fetch(API.dashboard, { school, hostel: hostel || undefined });
    return data && typeof data === "object" && !Array.isArray(data) ? data : null;
}
export async function getHostelReport(school, report, filters = {}) {
    return asList(await __fetch(API.reports, { school, report, ...filters }));
}

/* ------------------------------------------------------------ superadmin */
export async function getHostelAccess() {
    const data = await __fetch(API.access, {});
    return {
        schools: asList(data?.schools),
        enabled: data?.enabled || 0,
        total: data?.total || 0,
    };
}
export async function setHostelAccess(school, uses_hostel) {
    // `clean: false` — cleanEmptyFields would strip `uses_hostel: false`, which
    // is the entire payload when SWITCHING A SCHOOL OFF.
    return __update(API.access, { school, uses_hostel }, false);
}
