import { __fetch, __save, __update } from "..";
import server from "../../server";

const SEAT_PLAN_API = "/api/exams/seat-plan";

// A seat plan is set up in two steps, and the calls follow them:
//   1. ROOMS belong to the school — created once, with no exam.
//   2. SEATING belongs to an exam — which classes go to which room.

// Step 1: the school's rooms, without any seating.
export async function getSeatPlanRooms(school) {
    const data = await __fetch(`${SEAT_PLAN_API}/rooms`, { school });
    return Array.isArray(data?.rooms) ? data.rooms : [];
}

// What sits on each side of one room's bench, exam by exam (newest first) —
// read before its "students per bench" is changed. null when it cannot be read.
//   [{ exam, name, academic_year_name, sides: [{ column, classes: [{ id, name }], seated }] }]
export async function getSeatPlanRoomSides(school, room) {
    const data = await __fetch(`${SEAT_PLAN_API}/sides`, { school, room });
    return Array.isArray(data?.exams) ? data.exams : null;
}

// Create or update a room: { id?, school, name, benches, seats_per_bench, note }.
// An update may carry `sides` — the new bench left to right, each entry the old
// side kept there or null for a new empty one (see BenchSidesDialog).
export async function saveSeatPlanRoom(data) {
    if (data?.id) return __update(SEAT_PLAN_API, data, false);
    return __save(SEAT_PLAN_API, data, false);
}

// Not `__delete`: that asks a generic "Delete this record?" of its own, and the
// page has already asked the specific question (what happens to the students
// seated there). One question per delete.
export async function deleteSeatPlanRoom(school, id) {
    try {
        const res = await server.delete(SEAT_PLAN_API, { params: { school, id } });
        return [res?.status || 200, res.data?.message, res.data];
    } catch (e) {
        return [400, e?.response?.data?.message || e?.response?.data?.detail || e.message, null];
    }
}

// Step 2: an exam's seating — every room, with the classes sent to it for that
// exam and the seats saved for it.
export async function getSeatPlan(school, exam) {
    return __fetch(SEAT_PLAN_API, { school, exam });
}

// Save who sits where for an exam (every room at once) and seat the students.
//   rooms  [{ id, classes: [{ class_info, column, limit }] }]
export async function saveSeating({ school, exam, rooms, order_by, shuffle }) {
    return __save(`${SEAT_PLAN_API}/seating`, { school, exam, rooms, order_by, shuffle: !!shuffle }, false);
}

// Every room at once, for `clearSeating`.
export const ALL_ROOMS = "all";

// Take an exam's seating out of one room (`room` = its id) or out of every room
// (`room` = ALL_ROOMS): the classes sent there and the seats made there go, for
// this exam only. Nobody is seated again — the other rooms keep every seat as
// it is. The room is always named: the server refuses a request without one
// rather than reading it as "every room".
export async function clearSeating({ school, exam, room }) {
    return __save(`${SEAT_PLAN_API}/clear`, { school, exam, room }, false);
}

// Which exams have a seating, in head-counts, newest exam first:
// [{ exam, name, academic_year_name, rooms, seated }].
export async function getSeatPlans(school) {
    const data = await __fetch(`${SEAT_PLAN_API}/plans`, { school });
    return Array.isArray(data?.plans) ? data.plans : [];
}

// Start an exam from another exam's seating: the classes sent to each room are
// copied, then seated from today's student lists. The source is not changed,
// and the server refuses an exam that already has classes in its rooms.
export async function copySeatPlan({ school, from_exam, to_exam }) {
    return __save(`${SEAT_PLAN_API}/copy`, { school, from_exam, to_exam }, false);
}

// What generating the plan WOULD seat, in head-counts only — no students, no
// request. It walks the rooms exactly as `generate_rooms` does on the backend
// (rooms in order → bench → side → the side's classes in order, each class one
// shared queue across every room), so the form can say "5 of this class still
// need a room" while the teacher is still typing.
//
//   rooms        [{ id, benches, seats_per_bench, classes: [{ class_info, column, limit }] }]
//   classCounts  { [class_info]: running students }
//
// Returns
//   rooms    { [room.id]: { capacity, seated, free, sides: { [column]: { seated, free, entries } } } }
//            entries = the side's classes in fill order, each with `seated`
//   classes  { [class_info]: { total, seated, left } } for every class in a room
//   unseated total of `left`
export function simulateSeatPlan(rooms, classCounts = {}) {
    const left = {};
    const totalOf = (classId) => Number(classCounts?.[classId]) || 0;
    const result = { rooms: {}, classes: {}, unseated: 0 };

    for (const room of rooms || []) {
        const benches = Math.max(0, Number(room.benches) || 0);
        const columns = Math.max(1, Number(room.seats_per_bench) || 1);
        const sides = {};
        for (let c = 1; c <= columns; c++) sides[c] = { column: c, seated: 0, free: benches, entries: [] };

        for (const rc of room.classes || []) {
            const classId = Number(rc.class_info);
            const side = sides[Number(rc.column)];
            // same rules as `_save_room_classes`: no side the room lacks, no
            // class twice on one side
            if (!classId || !side || side.entries.some((e) => e.class_info === classId)) continue;
            if (!(classId in left)) left[classId] = totalOf(classId);
            side.entries.push({ ...rc, class_info: classId, limit: Number(rc.limit) > 0 ? Number(rc.limit) : null, seated: 0 });
        }

        let seated = 0;
        for (let bench = 1; bench <= benches; bench++) {
            for (let c = 1; c <= columns; c++) {
                const side = sides[c];
                for (const entry of side.entries) {
                    if (entry.limit && entry.seated >= entry.limit) continue;
                    if (left[entry.class_info] <= 0) continue;
                    left[entry.class_info] -= 1;
                    entry.seated += 1;
                    side.seated += 1;
                    side.free -= 1;
                    seated += 1;
                    break;
                }
            }
        }
        result.rooms[room.id] = { capacity: benches * columns, seated, free: benches * columns - seated, sides };
    }

    for (const [classId, remaining] of Object.entries(left)) {
        const total = totalOf(classId);
        result.classes[classId] = { total, seated: total - remaining, left: remaining };
        result.unseated += remaining;
    }
    return result;
}

// Ordering options for the UI (mirrors ORDER_BY_* on the backend).
export const SEAT_ORDER_OPTIONS = [
    { id: 1, name: "Roll No." },
    { id: 2, name: "Symbol No." },
    { id: 3, name: "Name (alphabetical)" },
    { id: 4, name: "Registration No." },
];
