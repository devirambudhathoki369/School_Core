import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { useReactToPrint } from "react-to-print";
import { ChevronDownIcon, PencilSquareIcon, PrinterIcon, TrashIcon } from "@heroicons/react/24/outline";

import { Section } from "@/components/sections";
import { formatImagePath } from "@/methods/formatMediaPath";

// One flat colour per class, so a glance at the diagram shows which class sits
// where and that neighbours on a bench differ. It rides on the seat's left
// edge and the legend dot — borders print, backgrounds usually do not.
const CLASS_COLOURS = [
    "#0d9488", "#2563eb", "#d97706", "#db2777", "#7c3aed",
    "#16a34a", "#dc2626", "#0891b2", "#65a30d", "#c026d3",
];

// A printed row IS a bench: a room made with two students per bench prints two
// cards per row, never three. The card comes in three shapes, by how many share
// the row:
//   1-2  wide    photo at the left, the name and details beside it on three
//                lines - short enough that a room of 11-12 benches is ONE sheet
//   3    roomy   the card schools know from the old seat plan
//   4-5  narrow  the photo above the details
// A bench longer than MAX_CARDS_PER_ROW cannot fit one A4 row, so it wraps
// under its own "Bench n" heading instead of running into the next bench.
const WIDE_PER_ROW = 2;
const ROOMY_PER_ROW = 3;
const MAX_CARDS_PER_ROW = 5;
// the space between cards on a row, and between one bench and the next
const PRINT_GAPS = {
    wide: { cards: "gap-2", benches: "mb-1.5" },
    roomy: { cards: "gap-3", benches: "mb-3" },
    narrow: { cards: "gap-2", benches: "mb-1.5" },
};

// { [class_info]: colour } — stable across rooms: by class id over the whole plan.
export function classColours(rooms) {
    const ids = new Set();
    (rooms || []).forEach((room) => {
        (room.classes || []).forEach((c) => ids.add(Number(c.class_info)));
        (room.allocations || []).forEach((a) => ids.add(Number(a.class_info)));
    });
    return [...ids].sort((a, b) => a - b).reduce((acc, id, i) => {
        acc[id] = CLASS_COLOURS[i % CLASS_COLOURS.length];
        return acc;
    }, {});
}

// The dot is drawn with a BORDER, not a background: browsers drop backgrounds
// when printing, and a legend with no colours is no legend.
export function ClassDot({ colour }) {
    return <span className="inline-block h-0 w-0 rounded-full border-[5px] shrink-0" style={{ borderColor: colour || "#94a3b8" }} aria-hidden="true"></span>;
}

// { [bench]: { [side]: seat } }
function seatsByBench(room) {
    const byBench = {};
    (room.allocations || []).forEach((a) => {
        (byBench[a.bench_no] = byBench[a.bench_no] || {})[a.column] = a;
    });
    return byBench;
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The seated rooms as a list: choose a room to see who sits where, and print
// its seat plan or its attendance sheet — or every room's at once. A room's
// benches are changed in step 1; from its row here the school can go and change
// the classes sent to it (`onEdit`) or take everyone out of it (`onClear`).
//
//   busy      some write is in flight: nothing here may be clicked meanwhile
//   clearing  the id of the room being cleared, if one is
//   onEdit    (roomId) — leave it out and the row has no Edit button
//   onClear   (roomId) — leave it out and the row has no Clear button
export function RoomsList({ rooms, classesMap, examName, colours: given, busy = false, clearing = null, onEdit, onClear }) {
    // What is printed lives apart from what is on screen, so a room prints the
    // same whether it is open or closed. `target` is the node the next print
    // job takes: every room, every sheet, or one room's.
    const target = useRef(null);
    const allPlans = useRef(null);
    const allSheets = useRef(null);
    const plans = useRef({});
    const sheets = useRef({});
    // which button is preparing its print — photos can take a moment to load,
    // and a second click meanwhile would queue the same sheets twice
    const [printing, setPrinting] = useState(null);
    const watchdog = useRef(null);
    const printed = () => { clearTimeout(watchdog.current); setPrinting(null); };
    const startPrint = useReactToPrint({ content: () => target.current, onAfterPrint: printed, onPrintError: printed });
    const print = (key, node) => {
        if (!node || printing) return;
        target.current = node;
        setPrinting(key);
        // never leave the buttons dead if the browser gives no answer
        clearTimeout(watchdog.current);
        watchdog.current = setTimeout(() => setPrinting(null), 20000);
        startPrint();
    };
    useEffect(() => () => clearTimeout(watchdog.current), []);

    // one room open at a time; a plan of one room has nothing to choose
    const [openId, setOpenId] = useState(() => (rooms.length === 1 ? rooms[0].id : null));
    const colours = given || classColours(rooms);
    const seated = rooms.filter((r) => (r.allocations?.length || 0) > 0);

    return (
        <Section title="Seated rooms" grid={false}
            description={onClear
                ? "Choose a room to see who sits where. From its row, print its seat plan or attendance sheet, change the classes sent to it, or clear it."
                : "Choose a room to see who sits where. Print one room's seat plan or attendance sheet from its row, or every room's at once."}
            actions={[
                <Button key="plans" variant="outlined" className="flex items-center justify-center gap-x-1"
                    disabled={seated.length === 0 || !!printing || busy} onClick={() => print("plans", allPlans.current)}>
                    <PrinterIcon className="w-4 h-4" aria-hidden="true" /> {printing === "plans" ? "Preparing…" : "Print All Seat Plans"}
                </Button>,
                <Button key="sheets" variant="outlined" className="flex items-center justify-center gap-x-1"
                    disabled={seated.length === 0 || !!printing || busy} onClick={() => print("sheets", allSheets.current)}>
                    <PrinterIcon className="w-4 h-4" aria-hidden="true" /> {printing === "sheets" ? "Preparing…" : "Print All Attendance Sheets"}
                </Button>,
            ]}>
            <ul className="flex flex-col gap-y-2.5">
                {rooms.map((room) => (
                    <RoomRow key={room.id} room={room} classesMap={classesMap} colours={colours}
                        open={openId === room.id} onToggle={() => setOpenId((id) => (id === room.id ? null : room.id))}
                        printing={printing} busy={busy} clearing={clearing === room.id}
                        onPrintPlan={() => print(`plan-${room.id}`, plans.current[room.id])}
                        onPrintSheet={() => print(`sheet-${room.id}`, sheets.current[room.id])}
                        onEdit={onEdit && (() => onEdit(room.id))}
                        onClear={onClear && (() => onClear(room.id))} />
                ))}
            </ul>

            {/* PRINT ONLY — every seated room's seat plan, a room to a page */}
            <div ref={allPlans} className="hidden print:block">
                {seated.map((room) => (
                    <RoomPrint key={room.id} room={room} classesMap={classesMap} examName={examName}
                        innerRef={(el) => { plans.current[room.id] = el; }} />
                ))}
            </div>
            {/* PRINT ONLY — every seated room's invigilator attendance sheet */}
            <div ref={allSheets} className="hidden print:block">
                {seated.map((room) => (
                    <AttendanceSheet key={room.id} room={room} classesMap={classesMap} examName={examName}
                        innerRef={(el) => { sheets.current[room.id] = el; }} />
                ))}
            </div>
        </Section>
    );
}

function AttendanceSheet({ room, classesMap, examName, innerRef }) {
    const rows = [...(room.allocations || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
    if (rows.length === 0) return null;
    return (
        <div ref={innerRef} className="break-after-page mb-6">
            <div className="text-center font-bold my-2">
                <div className="text-lg">Invigilator Attendance Sheet</div>
                {examName && <div className="capitalize">{examName}</div>}
                <div>Room: {room.name} — {plural(rows.length, "student")}</div>
            </div>
            <table className="w-full text-left border-collapse [&_th]:border [&_td]:border [&_th]:border-gray-600 [&_td]:border-gray-600 [&_th]:p-1 [&_td]:p-1 text-sm">
                <thead className="bg-gray-100">
                    <tr>
                        <th>S.N</th>
                        <th className="w-14">Photo</th>
                        <th>Symbol No.</th>
                        <th>Roll No.</th>
                        <th>Name</th>
                        <th>Class</th>
                        <th>Seat (Bench/Side)</th>
                        <th className="w-40">Signature</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((a, i) => (
                        <tr key={a.id}>
                            <td>{i + 1}</td>
                            <td>
                                {/* plain <img>: next/image is unreliable inside react-to-print output */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={formatImagePath(a.image, "/student-profile.png")}
                                    alt=""
                                    onError={(e) => { e.currentTarget.src = "/student-profile.png"; }}
                                    className="w-10 h-10 rounded object-cover border border-gray-300 bg-white"
                                />
                            </td>
                            <td>{a.symbol_no || ""}</td>
                            <td>{a.roll_no || ""}</td>
                            <td className="capitalize">{a.name}</td>
                            <td>{classesMap?.[a.class_info] || ""}</td>
                            <td>B{a.bench_no} / S{a.column}</td>
                            <td></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// One room on SCREEN: a row that says what the room holds, opens to its seats,
// and carries what a school does with it: the two things it prints, and — when
// the page allows them — changing its classes and clearing it.
function RoomRow({ room, classesMap, colours, open, onToggle, printing, busy, clearing, onPrintPlan, onPrintSheet, onEdit, onClear }) {
    const row = useRef(null);
    const head = useRef(null);
    const wasOpen = useRef(open);
    useEffect(() => {
        // Opening a room closes the one that was open. If that one sat above,
        // this row has just moved up the page — possibly out of sight. Bring
        // its heading back first, then as much of its seats as will fit.
        if (open && !wasOpen.current) {
            head.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
            row.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
        wasOpen.current = open;
    }, [open]);

    const capacity = room.capacity ?? (room.benches * room.seats_per_bench);
    const seated = room.allocations?.length || 0;
    const free = Math.max(0, capacity - seated);
    // the classes sitting here and how many of each, in seat order
    const classes = new Map();
    [...(room.allocations || [])].sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
        .forEach((a) => classes.set(a.class_info, (classes.get(a.class_info) || 0) + 1));
    const panelId = `seat-plan-room-${room.id}`;

    return (
        <li ref={row} className={`rounded-lg border bg-white ${open ? "border-[var(--t-brand-solid)]" : "border-[var(--line)]"}`}>
            {/* the buttons sit beside the room only where four of them leave it
                room to be read; below that they take a line of their own */}
            <div ref={head} className={`flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between rounded-lg px-3 py-2.5 ${open ? "rounded-b-none border-b border-[var(--line-soft)] bg-[var(--surface-soft)]" : ""}`}>
                <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={panelId}
                    title={open ? "Hide this room's seats" : "Show who sits where in this room"}
                    className="flex min-w-0 flex-1 items-start gap-x-2.5 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-ring)]">
                    <ChevronDownIcon aria-hidden="true"
                        className={`mt-0.5 h-4 w-4 shrink-0 text-[var(--ink-500)] transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
                    <span className="flex min-w-0 flex-col gap-y-1">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-[15px] font-bold text-[var(--ink-900)] break-words">{room.name}</span>
                            <span className="text-xs text-[var(--ink-500)]">
                                {plural(room.benches, "bench", "benches")} × {room.seats_per_bench} per bench · {plural(capacity, "seat")}
                            </span>
                            <span className="text-xs font-semibold rounded px-1.5 py-0.5 bg-[#d1fae5] text-[#065f46]">{seated} seated</span>
                            {free > 0 &&
                                <span className="text-xs font-semibold rounded px-1.5 py-0.5 bg-[#fef3c7] text-[#92400e]">{free} free</span>}
                        </span>
                        {seated === 0
                            ? <span className="text-xs italic text-[var(--ink-500)]">No class sits in this room for this exam.</span>
                            : (
                                <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                                    {[...classes].map(([id, n]) => (
                                        <span key={id} className="flex items-center gap-x-1 text-xs font-semibold capitalize text-[var(--ink-700)]">
                                            <ClassDot colour={colours?.[id]} />
                                            {classesMap?.[id] || id}
                                            <span className="text-xs font-normal text-[var(--ink-500)]">({n})</span>
                                        </span>
                                    ))}
                                </span>
                            )}
                        {room.note && <span className="text-xs text-[var(--ink-600)] break-words">{room.note}</span>}
                    </span>
                </button>
                {/* a phone gets them two to a line, each a full-width target */}
                <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap xl:shrink-0 xl:flex-nowrap">
                    <RowButton icon={PrinterIcon} label={printing === `plan-${room.id}` ? "Preparing…" : "Seat Plan"}
                        disabled={seated === 0 || !!printing || busy}
                        title={`Print the seat plan of ${room.name}`} onClick={onPrintPlan} />
                    <RowButton icon={PrinterIcon} label={printing === `sheet-${room.id}` ? "Preparing…" : "Attendance Sheet"}
                        disabled={seated === 0 || !!printing || busy}
                        title={`Print the attendance sheet of ${room.name}`} onClick={onPrintSheet} />
                    {onEdit &&
                        <RowButton icon={PencilSquareIcon} label="Edit classes" disabled={busy}
                            title={`Change the classes sent to ${room.name}`} onClick={onEdit} />}
                    {onClear &&
                        <RowButton icon={TrashIcon} danger label={clearing ? "Clearing…" : "Clear room"} disabled={busy || !!printing}
                            title={`Remove every student from ${room.name} for this exam`} onClick={onClear} />}
                </div>
            </div>
            {open &&
                <div id={panelId} className="p-3">
                    <RoomDiagram room={room} classesMap={classesMap} colours={colours} />
                </div>}
        </li>
    );
}

// One thing to do with a room, from its row. `danger` is for the one that
// takes something away: it is drawn in red so it is never pressed for a print.
function RowButton({ icon: Icon, label, title, danger = false, disabled, onClick }) {
    const tone = danger
        ? `border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50
            disabled:hover:border-rose-200 focus-visible:ring-rose-200`
        : `border-[var(--line)] text-[var(--ink-700)] hover:border-[var(--field-line-hover)] hover:bg-[var(--surface-soft)]
            disabled:hover:border-[var(--line)] focus-visible:ring-[var(--t-ring)]`;
    return (
        <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
            className={`flex items-center justify-center gap-x-1.5 rounded-md border bg-white px-2.5 min-h-[2.125rem]
                transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white
                focus:outline-none focus-visible:ring-2 ${tone}`}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-xs font-semibold whitespace-nowrap">{label}</span>
        </button>
    );
}

// The COMPLETE room as a diagram: every bench it has, empty seats included — a
// diagram that stops at the last occupied bench does not match the room.
function RoomDiagram({ room, classesMap, colours }) {
    const byBench = seatsByBench(room);
    // how many of each class actually sit on each side: { [side]: { [class]: n } }
    const seatedBySide = {};
    (room.allocations || []).forEach((a) => {
        const side = (seatedBySide[a.column] = seatedBySide[a.column] || {});
        side[a.class_info] = (side[a.class_info] || 0) + 1;
    });
    const columns = Array.from({ length: room.seats_per_bench }, (_, i) => i + 1);
    const benchNos = Array.from({ length: room.benches }, (_, i) => i + 1);
    const classesOnSide = (column) => (room.classes || []).filter((c) => c.column === column);
    const gridStyle = { gridTemplateColumns: `repeat(${room.seats_per_bench}, minmax(0, 1fr))` };

    if ((room.classes || []).length === 0 && (room.allocations || []).length === 0) {
        return <p className="text-sm text-gray-500 italic">No class sits in this room for this exam.</p>;
    }
    return (
        <div className="flex flex-col gap-2">
            {/* side headers: which class(es) fill each side, and how many of each */}
            <div className="flex items-stretch gap-2">
                <span className="w-9 shrink-0"></span>
                <div className="grid flex-1 gap-2" style={gridStyle}>
                    {columns.map((c) => (
                        <div key={c} className="min-w-0 border-b-2 border-gray-300 pb-1">
                            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Side {c}</div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                                {classesOnSide(c).length === 0 && <span className="text-xs text-gray-400">kept empty</span>}
                                {classesOnSide(c).map((rc) => (
                                    <span key={rc.id ?? rc.class_info} className="flex items-center gap-x-1 text-xs font-semibold text-gray-800 capitalize">
                                        <ClassDot colour={colours?.[rc.class_info]} />
                                        {classesMap?.[rc.class_info] || rc.class_info}
                                        <span className="text-xs font-normal text-gray-500">({seatedBySide[c]?.[rc.class_info] || 0})</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            {/* orientation: bench 1 is the bench nearest the front */}
            <div className="flex items-stretch gap-2">
                <span className="w-9 shrink-0"></span>
                <div className="flex-1 rounded border border-gray-300 py-0.5 text-center text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                    Front of the room
                </div>
            </div>
            {benchNos.map((b) => (
                <div key={b} className="flex items-stretch gap-2">
                    <span className="w-9 shrink-0 text-xs font-bold text-gray-500 flex items-center" title={`Bench ${b}`}>B{b}</span>
                    <div className="grid flex-1 gap-2" style={gridStyle}>
                        {columns.map((c) => <Seat key={c} seat={byBench[b]?.[c]} classesMap={classesMap} colours={colours} />)}
                    </div>
                </div>
            ))}
        </div>
    );
}

// One room as PRINTED: the room's title (no school letterhead on these sheets),
// then one card per student laid out bench by bench — the cards on a row are
// the students who share that bench, side 1 on the left.
function RoomPrint({ room, classesMap, examName, innerRef }) {
    const byBench = seatsByBench(room);
    const perBench = room.seats_per_bench;
    const seated = room.allocations?.length || 0;
    // benches fill from the front, so the empty ones are at the back: stop at
    // the last bench somebody sits on
    const benchNos = Object.keys(byBench).map(Number).sort((a, b) => a - b);
    // Seats made before the room's benches were shortened may sit on a side the
    // room no longer has. Every seated student is printed all the same.
    const width = Math.max(perBench, ...(room.allocations || []).map((a) => a.column));
    const sides = Array.from({ length: width }, (_, i) => i + 1);
    // a bench too long for one row wraps under its own heading
    const wraps = width > MAX_CARDS_PER_ROW;
    const perRow = Math.min(width, MAX_CARDS_PER_ROW);
    const shape = perRow <= WIDE_PER_ROW ? "wide" : perRow <= ROOMY_PER_ROW ? "roomy" : "narrow";
    const gaps = PRINT_GAPS[shape];
    // single desks: the card keeps the width it has two to a row rather than
    // stretching across the sheet
    const gridStyle = { gridTemplateColumns: perRow === 1 ? "minmax(0, 50%)" : `repeat(${perRow}, minmax(0, 1fr))` };

    return (
        // each printed room starts its own page, so a sheet can go straight on
        // that room's door
        <div ref={innerRef} className="print:break-before-page print:first:break-before-auto">
            <div className="text-center mb-3 pb-2 border-b border-gray-400">
                {examName && <div className="text-sm font-semibold capitalize">{examName}</div>}
                <div className="text-xl font-bold">{room.name}</div>
                <div className="text-xs font-semibold">
                    Seat plan · {plural(seated, "student")} · {plural(room.benches, "bench", "benches")} · {perBench} per bench
                </div>
            </div>
            {/* plain blocks, one per bench: block flow is what every browser
                paginates dependably, and a bench is never split across pages */}
            {benchNos.map((b) => (
                <div key={b} className={`${gaps.benches} ${wraps ? "" : "break-inside-avoid"}`}>
                    {wraps &&
                        <div className="mb-1 border-b border-gray-400 text-xs font-bold uppercase tracking-wide break-after-avoid">Bench {b}</div>}
                    <div className={`grid ${gaps.cards}`} style={gridStyle}>
                        {sides.map((s) => {
                            const seat = byBench[b][s];
                            if (seat) return <PrintCard key={s} seat={seat} classesMap={classesMap} shape={shape} />;
                            // on a one-row bench the gap keeps side 2 under
                            // side 2; a wrapped bench just ends where it ends
                            return wraps ? null : <PrintEmptySeat key={s} bench={b} side={s} />;
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

// The seat (bench and side), so a card can be matched to its bench once the
// sheet is cut up or pinned to the door.
function SeatTag({ bench, side }) {
    return <span className="shrink-0 whitespace-nowrap rounded border border-gray-500 px-1 text-[11px] font-bold leading-[1.35]">B{bench} · S{side}</span>;
}

// One student as PRINTED, in the shape its row calls for (see WIDE_PER_ROW).
// Every shape carries the same things: photo, name, class / roll / symbol /
// regd, and the seat tag.
const PHOTO_SIZE = { wide: "h-[60px] w-[60px]", roomy: "h-[80px] w-[80px]", narrow: "h-12 w-12" };

function PrintCard({ seat, classesMap, shape = "roomy" }) {
    const photo = `border border-gray-400 rounded-md shrink-0 ${PHOTO_SIZE[shape]}`;
    const picture = seat.image
        // plain <img>: next/image is unreliable inside react-to-print output
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={formatImagePath(seat.image)} alt="" className={`${photo} object-cover`} />
        : <div className={photo}></div>;
    const tag = <SeatTag bench={seat.bench_no} side={seat.column} />;
    // The wide card keeps the name full size and sets the details one size
    // down: at full size a long symbol and registration number together need a
    // fourth line, and a 12-bench room then no longer fits one sheet.
    const small = shape !== "roomy";
    const name = <PrintLine label="Name" value={seat.name} capitalize small={shape === "narrow"} />;
    const klass = <PrintLine label="Class" value={classesMap?.[seat.class_info]} capitalize small={small} />;
    const roll = <PrintLine label="Roll No." value={seat.roll_no} small={small} />;
    const symbol = <PrintLine label="Symbol No." value={seat.symbol_no} small={small} />;
    const regd = <PrintLine label="Regd. No." value={seat.regd_no} small={small} />;

    if (shape === "wide") {
        // two details to a line; a pair too long for the line drops its
        // second half below instead of squeezing
        return (
            <div className="rounded-md border border-gray-400 px-2 py-1.5 flex items-center gap-x-2.5 break-inside-avoid min-w-0">
                {picture}
                <div className="flex flex-col gap-y-0.5 min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-x-2">{name}{tag}</div>
                    <div className="flex flex-wrap gap-x-4">{klass}{roll}</div>
                    <div className="flex flex-wrap gap-x-4">{symbol}{regd}</div>
                </div>
            </div>
        );
    }
    if (shape === "narrow") {
        return (
            <div className="rounded-md border border-gray-400 px-2 py-1.5 flex flex-col gap-y-0.5 break-inside-avoid min-w-0">
                <div className="flex items-start justify-between gap-x-1.5 mb-0.5">{picture}{tag}</div>
                {name}{klass}{roll}{symbol}{regd}
            </div>
        );
    }
    // roomy: the card schools already know from the old seat plan — name on its
    // own line, then the photo beside class / roll / symbol / regd
    return (
        <div className="rounded-md border border-gray-400 px-2.5 py-2 flex flex-col gap-y-1.5 break-inside-avoid min-w-0">
            <div className="flex items-start justify-between gap-x-2">{name}{tag}</div>
            <div className="flex items-start gap-x-2.5">
                {picture}
                <div className="flex flex-col gap-y-1 min-w-0 flex-1">{klass}{roll}{symbol}{regd}</div>
            </div>
        </div>
    );
}

// A seat nobody was given, as PRINTED — it holds its place on the bench's row.
function PrintEmptySeat({ bench, side }) {
    return (
        <div className="rounded-md border border-dashed border-gray-400 px-2.5 py-2 flex items-start justify-between gap-x-2 break-inside-avoid min-w-0">
            <span className="text-xs font-medium text-gray-600">Empty seat</span>
            <SeatTag bench={bench} side={side} />
        </div>
    );
}

// Label and value flow as one line of text; only a value too long for the card
// wraps, and then only at word boundaries. Sizes sit on each span: the global
// `*` font-size rule means nothing here inherits one.
function PrintLine({ label, value, capitalize = false, small = false }) {
    const size = small ? "text-xs" : "text-[13px]";
    return (
        // the small line sits tighter: six benches of four are 24 narrow cards
        // five lines deep, and they have to share one sheet
        <div className={`${small ? "leading-tight" : "leading-snug"} min-w-0`}>
            <span className={`whitespace-nowrap ${size} font-medium text-gray-700`}>{label}:</span>{" "}
            <span className={`${size} font-bold text-black break-words ${capitalize ? "capitalize" : ""}`}>{value ?? ""}</span>
        </div>
    );
}

function Seat({ seat, classesMap, colours }) {
    if (!seat) {
        return (
            <div className="rounded-md border border-dashed border-gray-300 px-3 py-2 flex items-center min-h-[3.25rem] sm:min-h-[4.5rem]">
                <span className="text-xs text-gray-400">Empty</span>
            </div>
        );
    }
    return (
        <div className="rounded-md border border-gray-300 border-l-4 bg-white px-2 py-2 sm:px-3 min-w-0"
            style={{ borderLeftColor: colours?.[seat.class_info] || "#94a3b8" }}>
            <div className="flex items-center gap-x-2 sm:gap-x-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={formatImagePath(seat.image, "/student-profile.png")}
                    alt=""
                    onError={(e) => { e.currentTarget.src = "/student-profile.png"; }}
                    className="w-9 h-9 sm:w-14 sm:h-14 shrink-0 rounded-md object-cover border border-gray-300 bg-white"
                />
                <div className="flex flex-col min-w-0">
                    <span className="font-semibold capitalize text-gray-900 text-sm sm:text-[15px] leading-tight break-words">{seat.name}</span>
                    <span className="text-xs text-gray-600 mt-0.5 capitalize">
                        {classesMap?.[seat.class_info] || ""}{seat.roll_no ? ` • Roll ${seat.roll_no}` : ""}{seat.symbol_no ? ` • Sym ${seat.symbol_no}` : ""}
                    </span>
                    {/* seated before they left this class — generating again drops them */}
                    {seat.stale &&
                        <span className="text-xs font-semibold text-[#92400e]">No longer in this class</span>}
                </div>
            </div>
        </div>
    );
}
