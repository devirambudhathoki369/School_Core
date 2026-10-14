import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { SearchInput } from "@/components/inputs";
import { ClassDot } from "./Rooms";

const emptyRow = () => ({ class_info: "", limit: "" });

// A room's saved classes as the editor's sides, each side's classes in fill
// order: { [column]: [{ class_info, limit }] }. Every side has at least one
// (possibly blank) row, so there is always a dropdown to choose from.
export function roomToSides(room) {
    const sides = {};
    for (let c = 1; c <= room.seats_per_bench; c++) sides[c] = [];
    (room.classes || []).forEach((rc) => {
        if (sides[rc.column]) sides[rc.column].push({ class_info: rc.class_info, limit: rc.limit || "" });
    });
    Object.keys(sides).forEach((c) => { if (sides[c].length === 0) sides[c] = [emptyRow()]; });
    return sides;
}

// The editor's sides as the API's `classes` list. `row` (the row's index on its
// side) rides along so the live preview can be matched back to the row; the
// backend ignores it.
export function sidesToClasses(sides, seatsPerBench) {
    const classes = [];
    for (let column = 1; column <= seatsPerBench; column++) {
        (sides?.[column] || []).forEach((r, row) => {
            if (!r.class_info) return;
            classes.push({
                class_info: Number(r.class_info),
                column,
                limit: Number(r.limit) > 0 ? Number(r.limit) : null,
                row,
            });
        });
    }
    return classes;
}

// The same sides after one change — used by the page to keep its draft.
export const sideChanges = {
    set: (rows, index, patch) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
    add: (rows) => [...rows, emptyRow()],
    remove: (rows, index) => (rows.length <= 1 ? [emptyRow()] : rows.filter((_, i) => i !== index)),
};

/**
 * One side of a room's benches: which class sits on it (and, when that class
 * leaves benches free, which class takes the rest).
 *
 *   side        the simulated outcome for this side: { seated, free, entries }
 *   classStats  { [class_info]: { total, seated, left } } over the whole exam
 *   colours     { [class_info]: colour } — the same dot the seat chart uses
 */
export function SideEditor({ column, rows, side, classOptions, classesMap, classCounts, classStats, colours, disabled, onRow, onAdd, onRemove }) {
    const benches = (side?.seated || 0) + (side?.free || 0);
    const free = side?.free ?? 0;
    const chosen = rows.filter((r) => r.class_info).length;
    const hasBlankRow = rows.some((r) => !r.class_info);
    const entryOf = (index) => side?.entries?.find((e) => e.row === index);
    return (
        <div className="min-w-0 flex flex-col gap-y-1.5">
            <div className="flex items-baseline justify-between gap-x-2">
                {/* sizes repeated on each span: the global `*` font-size rule means nothing here inherits one */}
                <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-600)]">Side {column}</span>
                {chosen > 0 &&
                    <span className={`text-xs font-semibold ${free > 0 ? "text-[#1e40af]" : "text-[var(--ink-500)]"}`} aria-live="polite">
                        {free > 0 ? `${free} of ${benches} seats free` : "full"}
                    </span>}
            </div>
            {rows.map((row, index) => {
                const taken = new Set(rows.filter((r, i) => i !== index && r.class_info).map((r) => `${r.class_info}`));
                const options = classOptions.filter((o) => !taken.has(`${o.value}`))
                    .map((o) => ({ value: o.value, name: `${o.name} — ${Number(classCounts?.[o.value]) || 0} students` }));
                return (
                    <div key={index}>
                        <div className="flex items-center gap-x-1.5">
                            {row.class_info && <ClassDot colour={colours?.[row.class_info]} />}
                            {/* the app's searchable picker: a school has dozens of classes,
                                and typing "nine" beats scrolling to it. It draws its own
                                label gap (`mt-1`), which a row of controls does not want. */}
                            <div className="min-w-0 flex-1 [&_.app-field-label]:hidden [&_.app-picker-trigger]:mt-0">
                                <SearchInput grid={12}
                                    input={{
                                        name: `side-${column}-class-${index}`,
                                        label: "class", hideLabel: true,
                                        placeholder: index === 0 ? "Select class" : "Select another class",
                                        options, readOnly: disabled,
                                    }}
                                    value={row.class_info ?? ""}
                                    onChange={({ value }) => onRow(index, { class_info: value })} />
                            </div>
                            <input type="number" min={1} inputMode="numeric" placeholder="All"
                                value={row.limit ?? ""} disabled={!row.class_info || disabled}
                                aria-label={`Side ${column}, class ${index + 1}: how many students sit here (empty = all that fit)`}
                                title="How many students of this class sit here. Leave it empty to seat as many as fit."
                                onChange={(e) => onRow(index, { limit: e.target.value })}
                                className="w-16 shrink-0 text-base p-2 bg-white/40 border border-blue-gray-200 rounded-[7px] shadow-sm focus:outline-none focus:!border-teal-400 focus:ring-2 focus:ring-teal-400/40 disabled:opacity-40" />
                            <button type="button" onClick={() => onRemove(index)}
                                disabled={disabled || (rows.length === 1 && !row.class_info)}
                                className="p-1.5 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-rose-600 disabled:opacity-30"
                                title="Remove this class from the side" aria-label={`Remove class ${index + 1} from side ${column}`}>
                                <XMarkIcon className="w-4 h-4" />
                            </button>
                        </div>
                        {row.class_info &&
                            <RowStatus entry={entryOf(index)} stats={classStats?.[row.class_info]}
                                name={classesMap?.[row.class_info]} />}
                    </div>
                );
            })}
            {/* a short class left benches free — offer them to another class, never force it */}
            {chosen > 0 && free > 0 && !hasBlankRow && (
                <button type="button" onClick={onAdd} disabled={disabled}
                    className="flex items-center gap-x-1.5 self-start rounded-md border border-dashed border-gray-400 px-2 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50">
                    <PlusIcon className="w-3.5 h-3.5 shrink-0" />
                    <span className="text-xs">Add another class to the {free} free seat{free === 1 ? "" : "s"}</span>
                </button>
            )}
        </div>
    );
}

// What happens to this row's class, in one line under the row.
function RowStatus({ entry, stats, name }) {
    const here = entry?.seated || 0;
    const left = stats?.left || 0;
    const total = stats?.total || 0;
    let tone = "text-[#047857]";
    let text;
    if (total === 0) {
        tone = "text-gray-500";
        text = "This class has no running students.";
    } else if (here > 0 && left === 0) {
        text = `${here} of ${total} sit here — the whole class has a seat.`;
    } else if (here > 0) {
        tone = "text-[#92400e]";
        text = `${here} of ${total} sit here — ${left} still need${left === 1 ? "s" : ""} a room.`;
    } else if (left === 0) {
        tone = "text-gray-500";
        text = `All ${total} already have a seat in another room — none will sit here.`;
    } else {
        tone = "text-[#92400e]";
        text = `No seat left for them on this side — ${left} still need${left === 1 ? "s" : ""} a room.`;
    }
    // The class is named through `aria-label`, NOT a visually-hidden span. A
    // `sr-only` span is `position: absolute`, and the app's scroll area
    // (`.viewc`) is not a positioned box — so such a span is laid out against
    // the PAGE, not the scroller. Far down a long list it made the document
    // taller than the window, and scrolling slid the whole app up off the screen.
    return <p className={`mt-1 text-xs font-medium ${tone}`} aria-live="polite" aria-label={`${name || "Class"}: ${text}`}>{text}</p>;
}
