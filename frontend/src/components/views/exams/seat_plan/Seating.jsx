import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";

import { confirmAction } from "@/components/ConfirmDialog";
import Checkbox from "@/components/inputs/Checkbox";
import { SearchInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import EmptyState from "@/components/EmptyState";
import { Section } from "@/components/sections";
import {
    getSeatPlan,
    saveSeating,
    copySeatPlan,
    clearSeating,
    simulateSeatPlan,
    ALL_ROOMS,
    SEAT_ORDER_OPTIONS,
} from "@/services/functions/exams/seatPlan";
import { SideEditor, roomToSides, sidesToClasses, sideChanges } from "./SideEditor";
import Unseated from "./Unseated";
import CopyPlan, { planLabel } from "./CopyPlan";
import { RoomsList, ClassDot, classColours } from "./Rooms";
import { CheckIcon } from "@heroicons/react/24/solid";
import { TrashIcon } from "@heroicons/react/24/outline";

// what decides who sits where — the part of a room's classes worth comparing
const seatingKey = (classes) => JSON.stringify((classes || []).map((c) => [Number(c.class_info), Number(c.column), Number(c.limit) || null]));

const students = (n) => `${n} student${n === 1 ? "" : "s"}`;
// what a room holds for the exam on the server: the seats made in it…
const seatsIn = (room) => room?.allocations?.length || 0;
// …or at least classes sent to it
const savedIn = (room) => seatsIn(room) > 0 || (room?.classes || []).length > 0;

// Who still has no seat, as [{ id, name, left, total, placed }]: classes that
// are in a room but have students left over, then — once the school has started
// sending classes and the exam's classes are known — those in no room at all.
function pendingGroups(plan, classCounts, eligibleSet, classesBackup, classesMap) {
    const list = Object.entries(plan.classes)
        .filter(([, c]) => c.left > 0)
        .map(([id, c]) => ({ id: Number(id), name: classesMap[id] || `Class ${id}`, left: c.left, total: c.total, placed: true }));
    if (Object.keys(plan.classes).length > 0 && eligibleSet.size > 0) {
        (classesBackup || []).forEach(([, cls]) => {
            const total = Number(classCounts?.[cls.id]) || 0;
            if (!eligibleSet.has(cls.id) || plan.classes[cls.id] || total === 0) return;
            list.push({ id: cls.id, name: cls.name, left: total, total, placed: false });
        });
    }
    return list;
}

/**
 * Step 2: seat one exam. Every room of the school is listed; the school chooses
 * the class for each side of each room, presses ONE button, and the students
 * are seated. Everything it needs from the app arrives as props, so it holds no
 * context of its own.
 *
 *   exam / examName  the exam being seated (its name is printed on the charts)
 *   plans            the exams that already have a seating (see `getSeatPlans`)
 *   onChanged        called after the seating was saved
 *   onGoToRooms      open step 1
 */
function Seating({ exam, examName, schoolId, classesBackup, updateNotification, plans, onChanged, onGoToRooms }) {
    // the rooms as SAVED: the classes sent to them for this exam, and the seats
    const [rooms, setRooms] = useState([]);
    // what is on screen and not saved yet: { [room.id]: sides } (see SideEditor)
    const [draft, setDraft] = useState({});
    // class ids of the exam's education level(s); [] = no restriction (show all)
    const [eligibleClasses, setEligibleClasses] = useState([]);
    // { [class_info]: running students } — what the live counts are worked from
    const [classCounts, setClassCounts] = useState({});
    const [orderBy, setOrderBy] = useState(1);
    const [shuffle, setShuffle] = useState(false);
    const [fetching, setFetching] = useState(true);
    // one flag for every write: while it is set nothing else can be clicked
    const [busy, setBusy] = useState(false);
    const [copying, setCopying] = useState(false);
    // which clear is in flight: a room's id, ALL_ROOMS, or null
    const [clearing, setClearing] = useState(null);
    // each room's card in "Send classes to the rooms", to bring one into view,
    // and the room whose card is being pointed at
    const cards = useRef({});
    const [pointedAt, setPointedAt] = useState(null);
    const pointTimer = useRef(null);
    // a slow answer for an exam the user has already switched away from must
    // not overwrite the current one
    const currentExam = useRef(exam);

    const eligibleSet = useMemo(() => new Set(eligibleClasses), [eligibleClasses]);
    const classesMap = useMemo(() => (classesBackup || []).reduce((acc, [, cls]) => {
        acc[cls.id] = cls.name;
        return acc;
    }, {}), [classesBackup]);

    function show(list, counts) {
        setRooms(list);
        setDraft(Object.fromEntries(list.map((room) => [room.id, roomToSides(room)])));
        if (counts) setClassCounts(counts);
        if (list.length > 0) setOrderBy(Number(list[0].order_by) || 1);
        // a seating that was made shuffled stays shuffled when it is made again
        setShuffle(list.some((room) => room.shuffled && (room.allocations?.length || 0) > 0));
    }

    async function load(examId) {
        setFetching(true);
        const data = await getSeatPlan(schoolId, examId);
        if (currentExam.current !== examId) return;
        setEligibleClasses(data?.eligible_classes || []);
        show(data?.rooms || [], data?.class_counts || {});
        setFetching(false);
    }

    useEffect(() => {
        currentExam.current = exam;
        setRooms([]);
        setDraft({});
        load(exam);
    }, [exam]);
    useEffect(() => () => clearTimeout(pointTimer.current), []);

    // ---- live numbers -----------------------------------------------------
    const classesOf = (room, sides = draft) => sidesToClasses(sides[room.id], room.seats_per_bench);
    // the rooms as they would be seated with what is on screen right now
    const draftRooms = useMemo(() => rooms.map((room) => ({ ...room, classes: classesOf(room) })), [rooms, draft]);
    const plan = useMemo(() => simulateSeatPlan(draftRooms, classCounts), [draftRooms, classCounts]);
    // one colour per class for the whole page, so the pickers, the overview and
    // the seat charts all point at the same class with the same dot
    const colours = useMemo(() => classColours(draftRooms), [draftRooms]);
    // …and as generating the SAVED choices would seat them today
    const savedPlan = useMemo(() => simulateSeatPlan(rooms, classCounts), [rooms, classCounts]);

    // Only offer classes of the exam's education level(s); fall back to all
    // classes when the exam isn't tied to any class yet. A class already in a
    // room stays offered whatever the list says, or its side would show empty.
    const usedClasses = new Set(draftRooms.flatMap((r) => r.classes.map((c) => c.class_info)));
    const classOptions = (classesBackup || [])
        .filter(([, cls]) => eligibleSet.size === 0 || eligibleSet.has(cls.id) || usedClasses.has(cls.id))
        .map(([, cls]) => ({ name: cls.name, value: cls.id }));

    const pending = useMemo(
        () => pendingGroups(plan, classCounts, eligibleSet, classesBackup, classesMap),
        [plan, eligibleSet, classesBackup, classCounts, classesMap]);

    // Every side that still has free seats — where leftover students can go.
    const targets = useMemo(() => draftRooms.flatMap((room) =>
        Object.values(plan.rooms[room.id]?.sides || {})
            .filter((side) => side.free > 0)
            .map((side) => ({
                room: room.id, roomName: room.name, column: side.column, free: side.free,
                // who sits on the room's other sides — to warn before a class
                // is seated beside itself
                others: room.classes.filter((c) => c.column !== side.column).map((c) => c.class_info),
            }))
    ), [draftRooms, plan]);

    // seats SAVED for this exam…
    const seated = rooms.reduce((n, r) => n + (r.allocations?.length || 0), 0);
    // …and how the classes on screen fill the rooms (the same numbers as the
    // meter on each room, so the tiles and the rooms never disagree)
    const willSeat = rooms.reduce((n, r) => n + (plan.rooms[r.id]?.seated || 0), 0);
    const capacity = rooms.reduce((n, r) => n + (r.capacity ?? ((r.benches * r.seats_per_bench) || 0)), 0);
    const anyClass = draftRooms.some((r) => r.classes.length > 0);
    // the screen differs from what is saved: the seats below are not these yet
    const dirty = rooms.some((room) => seatingKey(classesOf(room)) !== seatingKey(room.classes))
        || (rooms.length > 0 && Number(rooms[0].order_by) !== Number(orderBy));
    // The diagram shows SAVED seats. They go out of date when a student joins
    // or leaves a class, or a room's benches change, after the seating was made.
    // A seat is `stale` when its student has since left the class they sat as.
    const outdated = rooms.some((r) => (r.allocations?.length || 0) !== (savedPlan.rooms[r.id]?.seated || 0)
        || (r.allocations || []).some((a) => a.stale));

    // ---- changes on screen (nothing is saved until "Seat students") --------
    const changeSide = (roomId, column, fn) => setDraft((d) => {
        const sides = d[roomId] || {};
        return { ...d, [roomId]: { ...sides, [column]: fn(sides[column] || [{ class_info: "", limit: "" }]) } };
    });

    // ---- writes -------------------------------------------------------------
    // How a seating turned out, in words — counted the same way as the "still
    // need a seat" panel, so the message and the panel never disagree.
    function outcome(prefix, data) {
        const counts = data.class_counts || classCounts;
        const left = pendingGroups(simulateSeatPlan(data.rooms || [], counts), counts, eligibleSet, classesBackup, classesMap)
            .reduce((n, p) => n + p.left, 0);
        updateNotification(200, `${prefix} — ${data.seated} seated${left
            ? `, ${left} still need${left === 1 ? "s" : ""} a seat`
            : ", everyone has a seat"}.`);
    }

    // Seating again replaces every seat of this exam with one worked out from
    // the CURRENT student lists. When seats were already made — and may have
    // been printed — that is asked for, never assumed.
    async function okToReseat() {
        if (seated === 0) return true;
        return confirmAction({
            title: "Seat the students again?",
            body: outdated
                ? "These seats are out of date: students joined, left or changed class, or a room was changed or cleared, since this seat plan was made. Every room is seated again from today's lists, so seat charts already printed will no longer match."
                : "Every room is seated again with the classes chosen above. Seat charts already printed for this exam may no longer match.",
            confirmText: "Seat again",
            tone: "warning",
        });
    }

    // Save the classes of every room and seat the exam — the one write there is.
    async function seat(sides, prefix) {
        if (busy || rooms.length === 0) return;
        if (!(await okToReseat())) return;
        setBusy(true);
        const [status, message, data] = await saveSeating({
            school: schoolId,
            exam,
            order_by: Number(orderBy) || 1,
            shuffle,
            rooms: rooms.map((room) => ({
                id: room.id,
                classes: classesOf(room, sides).map(({ class_info, column, limit }) => ({ class_info, column, limit })),
            })),
        });
        if (status === 200) onChanged?.();
        if (currentExam.current === exam) {
            if (status === 200 && data) {
                show(data.rooms || [], data.class_counts);
                outcome(prefix, data);
            } else {
                updateNotification(400, message || "Failed to seat the students.");
            }
        }
        setBusy(false);
    }

    // Seat a class's leftover students on a side that still has free seats.
    function onAssign(classId, roomId, column, count) {
        const room = rooms.find((r) => r.id === roomId);
        if (!room || busy || count < 1) return;
        const rows = (draft[roomId]?.[column] || []).filter((r) => r.class_info);
        const existing = rows.find((r) => Number(r.class_info) === classId);
        let next;
        if (existing) {
            // already on this side but capped — let that many more sit here
            next = rows.map((r) => (r === existing ? { ...r, limit: (Number(r.limit) || 0) + count } : r));
        } else {
            // Rooms fill in order. If this room comes before one the class is
            // already in, an open-ended entry would pull students out of that
            // room; capping it at the leftover count moves exactly these.
            const pullsFromLater = draftRooms.some((r) => r.id >= roomId && r.classes.some((c) => c.class_info === classId));
            next = [...rows, { class_info: classId, limit: pullsFromLater ? count : "" }];
        }
        const sides = { ...draft, [roomId]: { ...draft[roomId], [column]: next } };
        setDraft(sides);
        seat(sides, `Seated in ${room.name}`);
    }

    // Send the same classes to the same rooms as an exam already seated.
    async function onCopy(source) {
        if (busy || !source) return;
        setBusy(true);
        setCopying(true);
        const [status, message, data] = await copySeatPlan({ school: schoolId, from_exam: source.exam, to_exam: exam });
        onChanged?.();
        if (currentExam.current === exam) {
            if (status === 200 && data) {
                show(data.rooms || [], data.class_counts);
                outcome(`Same seating as ${planLabel(source)}`, data);
            } else {
                updateNotification(400, message || "Failed to copy the seating.");
                await load(exam);
            }
        }
        setCopying(false);
        setBusy(false);
    }

    // ---- clearing ---------------------------------------------------------
    // A room with nothing on screen and nothing saved has nothing to clear.
    const chosenIn = (room) => classesOf(room).length > 0;
    const emptied = (room) => roomToSides({ ...room, classes: [] });

    // Take the exam's seating out of one room, or out of every room, and show
    // what is left. Only the cleared rooms' pickers are reset: what the school
    // was choosing for the other rooms, the order and the shuffle box stay.
    async function clear(which, done) {
        setBusy(true);
        setClearing(which);
        const [status, message, data] = await clearSeating({ school: schoolId, exam, room: which });
        if (status === 200) onChanged?.();
        if (currentExam.current === exam) {
            if (status === 200 && data) {
                const list = data.rooms || [];
                setRooms(list);
                if (data.class_counts) setClassCounts(data.class_counts);
                setDraft((d) => Object.fromEntries(list.map((room) => [room.id,
                    which === ALL_ROOMS || room.id === which || !d[room.id] ? roomToSides(room) : d[room.id]])));
                updateNotification(200, done(Number(data.seats_removed) || 0));
            } else {
                updateNotification(400, message || "Could not clear the seats. Nothing was changed.");
            }
        }
        setClearing(null);
        setBusy(false);
    }

    // Empty one room for this exam. The other rooms are not seated again, so
    // nothing printed for them goes wrong because of this.
    async function onClearRoom(roomId) {
        const room = rooms.find((r) => r.id === roomId);
        if (!room || busy) return;
        // nothing of it is saved yet: the choices on screen are all there is
        if (!savedIn(room)) {
            setDraft((d) => ({ ...d, [room.id]: emptied(room) }));
            return;
        }
        const n = seatsIn(room);
        if (n > 0 && !(await confirmAction({
            title: `Clear ${room.name}?`,
            body: `${n === 1 ? `The one student seated in ${room.name} loses that seat` : `All ${n} students seated in ${room.name} lose their seats`} for this exam, and the classes chosen for this room are removed. Every other room keeps its seats exactly as they are.`,
            confirmText: "Clear room",
        }))) return;
        await clear(room.id, (removed) => (removed > 0
            ? `${room.name} cleared — ${students(removed)} no longer ${removed === 1 ? "has" : "have"} a seat for this exam.`
            : `${room.name} cleared.`));
    }

    // Empty every room for this exam: back to an exam nobody has seated.
    async function onClearAll() {
        if (busy) return;
        const saved = rooms.some(savedIn);
        if (!(await confirmAction(seated > 0 ? {
            title: "Clear every room for this exam?",
            body: `${seated === 1 ? "The one seated student loses that seat" : `All ${seated} students lose their seats`} for ${examName || "this exam"}, and the classes chosen for every room are removed. The rooms stay in your list, and other exams keep their seat plans.`,
            confirmText: "Clear all rooms",
        } : {
            title: "Remove the classes chosen for every room?",
            body: "Nobody is seated for this exam yet, so no seat is lost — the classes chosen on this page are removed from every room.",
            confirmText: "Clear all rooms",
            tone: "warning",
        }))) return;
        // nothing is saved for the exam: the choices on screen are all there is
        if (!saved) {
            setDraft(Object.fromEntries(rooms.map((room) => [room.id, emptied(room)])));
            return;
        }
        await clear(ALL_ROOMS, (removed) => (removed > 0
            ? `Every room cleared — ${students(removed)} no longer ${removed === 1 ? "has" : "have"} a seat for this exam.`
            : "Every room cleared."));
    }

    // "Edit" on a seated room: its classes are changed in the list above, so
    // bring that room's card into view, put the keyboard on its first class and
    // mark the card for a moment — the list can be a long way up the page.
    function onEditRoom(roomId) {
        const card = cards.current[roomId];
        if (!card) return;
        const calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        card.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
        card.querySelector(".app-picker-trigger")?.focus({ preventScroll: true });
        setPointedAt(roomId);
        clearTimeout(pointTimer.current);
        pointTimer.current = setTimeout(() => setPointedAt(null), 2600);
    }

    if (fetching) return <Loader />;
    if (rooms.length === 0) {
        return (
            <EmptyState title="Add the rooms first"
                hint="Students are sent to rooms, so the rooms come first. Add them in step 1 — it is done once and they stay for every exam."
                action={<Button color="teal" size="sm" onClick={onGoToRooms}>Go to step 1: Rooms</Button>} />
        );
    }

    const leftTotal = pending.reduce((n, p) => n + p.left, 0);
    const savedAnyClass = rooms.some((r) => (r.classes || []).length > 0);
    // an exam nobody has seated yet can start from one that was
    const sources = (plans || []).filter((p) => p.exam && Number(p.exam) !== Number(exam) && p.rooms > 0);
    const seatedRooms = rooms.filter((r) => (r.allocations?.length || 0) > 0);
    // the Seat button and "Seat here" say "Seating…" only for a seating
    const seating = busy && !copying && clearing === null;
    // one room has its own button; "all" is for a school with several
    const canClearAll = rooms.length > 1 && (anyClass || rooms.some(savedIn));

    return (
        <>
            {!savedAnyClass && !anyClass && sources.length > 0 &&
                <CopyPlan sources={sources} busy={busy} copying={copying} onCopy={onCopy} />}

            <Section title="Send classes to the rooms" grid={false}
                description="For each room, choose the class that sits on each side of the bench — a different class on each side, so classmates do not sit together. A class that does not fit in one room carries on in the next room you put it in."
                actions={canClearAll ? [
                    <Button key="clear-all" variant="outlined" color="red" className="flex items-center justify-center gap-x-1.5"
                        disabled={busy} onClick={onClearAll} title="Remove every class and every seated student from all the rooms, for this exam">
                        <TrashIcon className="w-4 h-4" aria-hidden="true" /> {clearing === ALL_ROOMS ? "Clearing…" : "Clear all rooms"}
                    </Button>,
                ] : undefined}>
                <ClassOverview classOptions={classOptions} classCounts={classCounts} stats={plan.classes} colours={colours} />
                <ul className="flex flex-col gap-y-2.5">
                    {draftRooms.map((room, index) => {
                        const sim = plan.rooms[room.id];
                        // `room` carries what is on screen; this is what is saved
                        const saved = rooms[index];
                        const clearable = room.classes.length > 0 || savedIn(saved);
                        const columns = Array.from({ length: room.seats_per_bench }, (_, i) => i + 1);
                        // a class on more than one side of the same room: classmates share a bench
                        const sidesOf = {};
                        room.classes.forEach((c) => (sidesOf[c.class_info] = sidesOf[c.class_info] || new Set()).add(c.column));
                        const beside = Object.keys(sidesOf).filter((id) => sidesOf[id].size > 1);
                        return (
                            <li key={room.id} ref={(el) => { cards.current[room.id] = el; }}
                                className={`rounded-lg border bg-white transition-shadow duration-300 ${pointedAt === room.id
                                    ? "border-[var(--t-brand-solid)] shadow-[0_0_0_3px_var(--t-ring)]" : "border-[var(--line)]"}`}>
                                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-t-lg border-b border-[var(--line-soft)] bg-[var(--surface-soft)] px-3 py-2">
                                    <span className="min-w-0">
                                        <span className="text-[15px] font-bold text-[var(--ink-900)] break-words">{room.name}</span>{" "}
                                        <span className="text-xs text-[var(--ink-500)]">
                                            {room.benches} bench{room.benches === 1 ? "" : "es"} × {room.seats_per_bench} = {sim?.capacity ?? 0} seats
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-x-2">
                                        <span className={`text-xs font-semibold rounded px-1.5 py-0.5 ${!sim?.seated ? "bg-white text-[var(--ink-500)] border border-[var(--line)]"
                                            : sim.free > 0 ? "bg-[#dbeafe] text-[#1e40af]" : "bg-[#d1fae5] text-[#065f46]"}`} aria-live="polite">
                                            {!sim?.seated ? "No class yet" : `${sim.seated} of ${sim.capacity} seats filled`}
                                        </span>
                                        {clearable &&
                                            <button type="button" disabled={busy} onClick={() => onClearRoom(room.id)}
                                                title={seatsIn(saved) > 0
                                                    ? `Remove every student from ${room.name} for this exam, and the classes chosen for it`
                                                    : `Remove the classes chosen for ${room.name}`}
                                                className="flex shrink-0 items-center gap-x-1 rounded-md border border-rose-200 bg-white px-2 min-h-[1.875rem] text-rose-700
                                                    transition-colors duration-150 hover:border-rose-300 hover:bg-rose-50
                                                    disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-rose-200 disabled:hover:bg-white
                                                    focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-200">
                                                <TrashIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                                <span className="text-xs font-semibold whitespace-nowrap">{clearing === room.id ? "Clearing…" : "Clear room"}</span>
                                            </button>}
                                    </span>
                                </div>
                                {/* how full the room is, at a glance down the list */}
                                <div className="h-1 bg-[var(--line-soft)]" aria-hidden="true">
                                    <div className="h-full transition-all duration-200"
                                        style={{ width: `${sim?.capacity ? Math.round((sim.seated / sim.capacity) * 100) : 0}%`, backgroundColor: sim?.free === 0 ? "#059669" : "var(--t-brand-solid, #0d9488)" }}></div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 p-3">
                                    {columns.map((column) => (
                                        <SideEditor key={column} column={column}
                                            rows={draft[room.id]?.[column] || [{ class_info: "", limit: "" }]}
                                            side={sim?.sides?.[column]} disabled={busy}
                                            classOptions={classOptions} classesMap={classesMap}
                                            classCounts={classCounts} classStats={plan.classes} colours={colours}
                                            onRow={(i, patch) => changeSide(room.id, column, (rows) => sideChanges.set(rows, i, patch))}
                                            onAdd={() => changeSide(room.id, column, sideChanges.add)}
                                            onRemove={(i) => changeSide(room.id, column, (rows) => sideChanges.remove(rows, i))} />
                                    ))}
                                </div>
                                {beside.length > 0 &&
                                    <p className="px-3 pb-2.5 text-xs font-medium text-[#92400e]" role="status">
                                        <span className="text-xs capitalize">{beside.map((id) => classesMap[id] || id).join(", ")}</span>{" "}
                                        {beside.length === 1 ? "is" : "are"} on more than one side here — students of the same class will sit next to each other.
                                    </p>}
                            </li>
                        );
                    })}
                </ul>

                {/* the one button of the page */}
                <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="flex items-center gap-x-2">
                            <span className="text-sm font-medium text-[var(--ink-700)]" id="seat-order-label">Order students by</span>
                            <div className="w-52 [&_.app-field-label]:hidden [&_.app-picker-trigger]:mt-0" aria-labelledby="seat-order-label">
                                <SearchInput grid={12}
                                    input={{
                                        name: "order_by", label: "order", hideLabel: true, readOnly: busy,
                                        options: SEAT_ORDER_OPTIONS.map((o) => ({ name: o.name, value: o.id })),
                                    }}
                                    value={orderBy}
                                    onChange={({ value }) => { if (value) setOrderBy(Number(value)); }} />
                            </div>
                        </div>
                        <Checkbox name="shuffle" text="Shuffle students (anti-cheating)" checked={shuffle} inline
                            description={"Mixes the order of students within each class\ninstead of seating them in order."}
                            onClick={() => setShuffle((s) => !s)} />
                    </div>
                    <div className="flex flex-col gap-1 md:items-end">
                        <Button color="teal" disabled={busy || (!anyClass && !savedAnyClass)} onClick={() => seat(draft, "Students seated")}>
                            {seating ? "Seating…" : seated > 0 && !dirty ? "Seat students again" : "Seat students"}
                        </Button>
                        <span className="text-xs text-[var(--ink-600)] md:text-right" aria-live="polite">
                            {!anyClass && !savedAnyClass ? "Choose a class for at least one room first."
                                : dirty ? "Changes are not saved yet — press the button to seat the students."
                                    : seated > 0 ? "The seats below match the classes chosen above." : "Press the button to seat the students."}
                        </span>
                    </div>
                </div>
            </Section>

            {(seated > 0 || anyClass) &&
                <dl className="flex flex-wrap gap-2 print:hidden">
                    <Stat label="Rooms" value={rooms.length} />
                    <Stat label="Seats" value={capacity} />
                    <Stat label={dirty || outdated ? "Will be seated" : "Seated"} value={willSeat} />
                    <Stat label="Free seats" value={Math.max(0, capacity - willSeat)} />
                    <Stat label="Still to seat" value={leftTotal} tone={leftTotal > 0 ? "warn" : "ok"} />
                </dl>}
            {outdated && !dirty &&
                <div className="rounded-md border border-blue-300 bg-blue-50 text-blue-900 px-3 py-2 text-sm print:hidden" role="status">
                    These seats are out of date: students joined, left or changed class, a room&apos;s benches changed, or a room was cleared, since they were made.
                    Press <b className="text-sm">Seat students again</b> to seat every room from today&apos;s lists; this replaces the seats shown.
                </div>}
            {anyClass &&
                <Unseated pending={pending} targets={targets} seatedTotal={outdated || dirty ? 0 : seated} roomCount={seatedRooms.length}
                    busy={busy} seating={seating} onAssign={onAssign} onNewRoom={onGoToRooms} />}
            {seatedRooms.length > 0 &&
                <RoomsList rooms={seatedRooms} classesMap={classesMap} examName={examName} colours={colours}
                    busy={busy} clearing={clearing} onEdit={onEditRoom} onClear={onClearRoom} />}
        </>
    );
}

// Every class of the exam and how much of it has a seat — the answer to "which
// classes have I sent already?" without reading down the rooms.
function ClassOverview({ classOptions, classCounts, stats, colours }) {
    const classes = classOptions
        .map((o) => ({ id: o.value, name: o.name, total: Number(classCounts?.[o.value]) || 0, seated: stats?.[o.value]?.seated || 0, placed: !!stats?.[o.value] }))
        .filter((c) => c.total > 0);
    if (classes.length === 0) return null;
    const done = classes.filter((c) => c.seated === c.total).length;
    return (
        <div className="mb-3">
            <div className="flex items-baseline justify-between gap-x-2 mb-1.5">
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-600)]">Classes</span>
                <span className="text-xs font-semibold text-[var(--ink-500)]" aria-live="polite">{done} of {classes.length} fully seated</span>
            </div>
            <ul className="flex flex-wrap gap-1.5">
                {classes.map((c) => {
                    const full = c.seated === c.total;
                    return (
                        <li key={c.id}
                            title={full ? "Every student of this class has a seat" : c.placed ? `${c.total - c.seated} still need a seat` : "Not sent to any room yet"}
                            className={`flex items-center gap-x-1.5 rounded-full border px-2.5 py-1 ${full ? "border-[#6ee7b7] bg-[#ecfdf5]"
                                : c.placed ? "border-[#fcd34d] bg-[#fffbeb]" : "border-[var(--line)] bg-white"}`}>
                            {full
                                ? <CheckIcon className="w-3.5 h-3.5 shrink-0 text-[#047857]" aria-hidden="true" />
                                : <ClassDot colour={c.placed ? colours?.[c.id] : "#cbd5e1"} />}
                            <span className="text-xs font-semibold capitalize text-[var(--ink-900)]">{c.name}</span>
                            <span className={`text-xs font-semibold ${full ? "text-[#047857]" : c.placed ? "text-[#92400e]" : "text-[var(--ink-500)]"}`}>
                                {c.seated}/{c.total}
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

// One number of the seating, labelled. `warn` / `ok` colour only the figure
// that answers "am I done?" — everything else stays neutral.
function Stat({ label, value, tone }) {
    const tones = {
        warn: "border-[#fcd34d] bg-[#fffbeb] text-[#92400e]",
        ok: "border-gray-300 bg-white text-[#047857]",
    };
    return (
        <div className={`rounded-md border px-3 py-1.5 min-w-[4.75rem] ${tones[tone] || "border-gray-300 bg-white text-gray-900"}`}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</dt>
            <dd className="text-lg font-bold leading-tight">{value}</dd>
        </div>
    );
}

export default Seating;
