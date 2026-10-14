// LOCAL-ONLY harness (excluded via .git/info/exclude — never committed).
// Runs the real seat plan page (Planner → RoomsSetup / Seating) against an
// in-memory stand-in for the API, so the whole flow can be clicked through
// without signing in.  ?seed=none | rooms | seated | two | single  picks what
// the school has (two = exams 1 and 2 both seated; single = one room, seated).
// ?slow=1 makes a clear take 1.2 s; ?fail=clear makes it fail. Clear requests
// are recorded in window.__clears.
import server from "@/services/server";
import Planner from "@/components/views/exams/seat_plan/Planner";
import { useEffect, useState } from "react";

const EXAMS = [
    { value: 1, name: "First Terminal Exam", year: "School 2083" },
    { value: 2, name: "Second Terminal Exam", year: "School 2083" },
    { value: 3, name: "Final Exam", year: "School 2083" },
];
const CLASSES = [
    [0, { id: 11, name: "One (A)" }], [1, { id: 12, name: "Two (A)" }],
    [2, { id: 13, name: "Three (A)" }], [3, { id: 14, name: "Four (B)" }],
];
const COUNTS = { 11: 20, 12: 13, 13: 10, 14: 8 };
const FIRST = ["Aarushi", "Abha", "Akhil", "Anirudh", "Arab", "Arick", "Aruhi", "Asbin", "Ayushka", "Bimash", "Bimita", "Bishwas", "Chitra", "Debit", "Dibyansh", "Dipisha", "Diyaan", "Garima", "Hari", "Ishan"];
const LAST = ["Chaudhary", "Dangaura", "Mahato", "Kathariya", "Dhami", "Chand", "Bista Bhandari"];
const STUDENTS = Object.fromEntries(Object.entries(COUNTS).map(([cls, n]) => [cls,
    Array.from({ length: n }, (_, i) => ({ id: cls * 100 + i, name: `${FIRST[(i + Number(cls)) % FIRST.length]} ${LAST[(i * 3 + Number(cls)) % LAST.length]}`, roll_no: i + 1, symbol_no: cls * 1000 + i }))]));

// rooms are the school's; classes and seats hang on a room PER EXAM
const db = { rooms: [], classes: [], seats: [], seq: 1 };
const ok = (config, data) => ({ data, status: 200, statusText: "OK", headers: {}, config });
const fail = (status, message) => Promise.reject({ response: { status, data: { message } } });
const classesOf = (room, exam) => db.classes.filter((c) => c.room === room.id && c.exam === exam).sort((a, b) => a.column - b.column || a.id - b.id);
function serialize(room, exam, seating = true) {
    const data = { id: room.id, name: room.name, benches: room.benches, seats_per_bench: room.seats_per_bench, capacity: room.benches * room.seats_per_bench, order_by: room.order_by, note: room.note || "", shuffled: !!room.shuffled };
    if (!seating) return data;
    return { ...data, exam, classes: classesOf(room, exam).map((c) => ({ ...c })), allocations: db.seats.filter((a) => a.room === room.id && a.exam === exam).map((a, i) => ({ ...a, stale: !!window.__markStale && i === 0 })) };
}
function saveClasses(room, exam, classes) {
    db.classes = db.classes.filter((c) => !(c.room === room.id && c.exam === exam));
    const seen = new Set();
    (classes || []).forEach((c) => {
        const key = `${c.column}:${c.class_info}`;
        if (!c.class_info || c.column > room.seats_per_bench || seen.has(key)) return;
        seen.add(key);
        db.classes.push({ id: db.seq++, room: room.id, exam, class_info: Number(c.class_info), column: Number(c.column), limit: c.limit || null, order_by: null });
    });
}
function generate(exam, shuffle, message = "Seat plan generated!") {
    window.__generates = (window.__generates || 0) + 1;
    db.seats = db.seats.filter((a) => a.exam !== exam);
    const queues = {};
    let seated = 0;
    db.rooms.forEach((room) => {
        room.shuffled = !!shuffle;
        const taken = {};
        let seq = 0;
        for (let b = 1; b <= room.benches; b++) for (let col = 1; col <= room.seats_per_bench; col++) {
            for (const rc of classesOf(room, exam).filter((c) => c.column === col)) {
                if (rc.limit && (taken[rc.id] || 0) >= rc.limit) continue;
                const q = (queues[rc.class_info] = queues[rc.class_info] || [...STUDENTS[rc.class_info]]);
                if (!q.length) continue;
                const s = q.shift();
                taken[rc.id] = (taken[rc.id] || 0) + 1;
                db.seats.push({ id: db.seq++, room: room.id, exam, student: s.id, class_info: rc.class_info, bench_no: b, column: col, sequence: ++seq, name: s.name, roll_no: s.roll_no, symbol_no: s.symbol_no, image: null });
                seated++;
                break;
            }
        }
    });
    const unseated = Object.values(queues).reduce((n, q) => n + q.length, 0);
    return { message, seated, unseated, rooms: db.rooms.map((r) => serialize(r, exam)), class_counts: COUNTS };
}
function addRoom(body) {
    const room = { id: db.seq++, name: body.name, benches: Number(body.benches), seats_per_bench: Number(body.seats_per_bench), order_by: body.order_by || 1, note: body.note || "" };
    db.rooms.push(room);
    return room;
}
function plans() {
    return [...new Set(db.classes.map((c) => c.exam))].sort((a, b) => b - a).map((exam) => {
        const e = EXAMS.find((x) => x.value === exam);
        return { exam, name: e?.name, academic_year_name: e?.year, rooms: new Set(db.classes.filter((c) => c.exam === exam).map((c) => c.room)).size, seated: db.seats.filter((a) => a.exam === exam).length };
    });
}
function seed(kind) {
    if (kind === "none") return;
    if (kind === "single") {
        const only = addRoom({ name: "Room 101", benches: 12, seats_per_bench: 2 });
        saveClasses(only, 1, [{ class_info: 13, column: 1 }, { class_info: 14, column: 2 }]);
        generate(1, false);
        return;
    }
    const [a, b, hall] = [{ name: "Room 101", benches: 12, seats_per_bench: 2 }, { name: "Room 102", benches: 10, seats_per_bench: 2 }, { name: "Hall", benches: 6, seats_per_bench: 3 }].map(addRoom);
    if (kind !== "seated" && kind !== "two") return;
    const exams = kind === "two" ? [1, 2] : [1];
    exams.forEach((exam) => {
        saveClasses(a, exam, [{ class_info: 11, column: 1 }, { class_info: 12, column: 2 }]);
        saveClasses(b, exam, [{ class_info: 11, column: 1 }, { class_info: 13, column: 2 }, { class_info: 12, column: 2 }]);
        saveClasses(hall, exam, [{ class_info: 14, column: 1 }]);
        generate(exam, false);
    });
}
// the room a clear names, read as strictly as the server reads it
function clearedRooms(room) {
    if (room === "all") return db.rooms;
    const id = Number.isInteger(room) && room > 0 ? room : (typeof room === "string" && /^[0-9]+$/.test(room) ? Number(room) : 0);
    return id ? db.rooms.filter((r) => r.id === id) : null;
}
if (typeof window !== "undefined" && !window.__seeded) { window.__seeded = true; seed(new URLSearchParams(window.location.search).get("seed") || "none"); }

server.defaults.adapter = async (config) => {
    await new Promise((r) => setTimeout(r, 200));
    const body = typeof config.data === "string" ? JSON.parse(config.data) : (config.data || {});
    const path = config.url.split("/api/exams/")[1];
    window.__calls = [...(window.__calls || []), `${config.method} ${path} ${config.data || JSON.stringify(config.params || {})}`];
    if (path === "seat-plan/rooms") return ok(config, { rooms: db.rooms.map((r) => serialize(r, null, false)) });
    if (path === "seat-plan/plans") return ok(config, { plans: plans(), rooms: db.rooms.length });
    if (path === "seat-plan/generate") return ok(config, generate(body.exam, body.shuffle));
    if (path === "seat-plan/seating") {
        (body.rooms || []).forEach((entry) => { const room = db.rooms.find((r) => r.id === entry.id); if (room) saveClasses(room, body.exam, entry.classes); });
        if (body.order_by) db.rooms.forEach((r) => { r.order_by = body.order_by; });
        return ok(config, generate(body.exam, body.shuffle, "Students seated!"));
    }
    if (path === "seat-plan/clear") {
        const query = new URLSearchParams(window.location.search);
        window.__clears = [...(window.__clears || []), body];
        if (query.get("slow")) await new Promise((r) => setTimeout(r, 1200));
        if (query.get("fail") === "clear") return fail(500, "");
        const exam = Number(body.exam);
        const targets = clearedRooms(body.room);
        if (!EXAMS.some((e) => e.value === exam) || !targets) return fail(400, "Invalid request!");
        if (targets.length === 0) return fail(404, "Not Found!");
        const ids = new Set(targets.map((r) => r.id));
        const gone = (row) => row.exam === exam && ids.has(row.room);
        const removed = db.seats.filter(gone).length;
        db.seats = db.seats.filter((a) => !gone(a));
        db.classes = db.classes.filter((c) => !gone(c));
        return ok(config, { message: body.room === "all" ? "Every room cleared!" : `${targets[0].name} cleared!`, seats_removed: removed, rooms: db.rooms.map((r) => serialize(r, exam)), class_counts: COUNTS });
    }
    if (path === "seat-plan/copy") {
        if (db.classes.some((c) => c.exam === body.to_exam)) return fail(409, "This exam already has classes in its rooms. A seating can only be copied into an exam that has none.");
        db.classes.filter((c) => c.exam === body.from_exam).sort((x, y) => x.id - y.id).forEach((c) => db.classes.push({ ...c, id: db.seq++, exam: body.to_exam }));
        return ok(config, generate(body.to_exam, db.rooms.some((r) => r.shuffled), "Seating copied!"));
    }
    if (config.method === "get") return ok(config, { rooms: db.rooms.map((r) => serialize(r, Number(config.params.exam))), eligible_classes: [11, 12, 13, 14], class_counts: COUNTS });
    if (config.method === "post") {
        if (`${body.note || ""}`.length > 200) return fail(400, "The note can be at most 200 characters.");
        return ok(config, { message: "Room saved!", room: serialize(addRoom(body), null, false) });
    }
    if (config.method === "put") {
        const room = db.rooms.find((r) => r.id === body.id);
        ["name", "benches", "seats_per_bench", "note"].forEach((f) => { if (body[f] !== undefined) room[f] = body[f]; });
        db.classes = db.classes.filter((c) => !(c.room === room.id && c.column > room.seats_per_bench));
        return ok(config, { message: "Room updated!", room: serialize(room, null, false) });
    }
    if (config.method === "delete") {
        const id = Number(config.params.id);
        db.rooms = db.rooms.filter((r) => r.id !== id);
        db.classes = db.classes.filter((c) => c.room !== id);
        db.seats = db.seats.filter((a) => a.room !== id);
        return ok(config, { message: "Room deleted!" });
    }
};

export default function SeatPlanPreview() {
    const [note, setNote] = useState("");
    // decided after mount, so the server and the first client render agree
    const [shell, setShell] = useState(false);
    useEffect(() => { setShell(!!new URLSearchParams(window.location.search).get("shell")); }, []);
    const page = (
        <>
            <div id="toast" className="text-sm font-semibold text-blue-900 min-h-[1.25rem]">{note}</div>
            <Planner schoolId={1} classesBackup={CLASSES} exams={EXAMS} examLabel="School 2083 Exams"
                updateNotification={(status, message) => setNote(`[${status}] ${message}`)} />
        </>
    );
    // ?shell=1 puts the page inside a replica of the real app shell
    // (`main > .app-shell > .view > .viewc`, every ancestor overflow-hidden and
    // only `.viewc` scrolling) — layout faults that only show there, show here.
    if (shell) {
        return (
            <main className="h-screen w-full bg-main">
                <div className="app-shell flex h-screen w-full overflow-hidden">
                    <div className="hidden md:block md:w-[15.5rem] md:shrink-0 bg-sidebar"></div>
                    <div className="view h-screen max-h-screen flex flex-col overflow-hidden">
                        <div className="view-header shrink-0 bg-white rounded-md p-3 text-sm font-semibold">School name · header</div>
                        <div className="viewc flex-1 min-h-0 rounded-md overflow-y-auto m-0">{page}</div>
                    </div>
                </div>
            </main>
        );
    }
    return <div className="p-4 max-w-6xl mx-auto flex flex-col gap-y-3 bg-white min-h-screen">{page}</div>;
}
