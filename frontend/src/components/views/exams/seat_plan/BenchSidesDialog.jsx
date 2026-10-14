import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogHeader, DialogBody, DialogFooter } from "@material-tailwind/react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";

const range = (n) => Array.from({ length: n }, (_, i) => i + 1);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const sideOf = (plan, column) => (plan?.sides || []).find((s) => s.column === column);
const classNames = (side, classesMap) =>
    (side?.classes || []).map((c) => classesMap?.[c.id] || c.name || "a class of another year");
const examLabel = (plan) =>
    (plan.exam ? [plan.name, plan.academic_year_name].filter(Boolean).join(" · ") : "Seating without an exam");
const listed = (items) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

/**
 * Asked before a room's "students per bench" is changed, when the room already
 * has classes or seated students on its sides.
 *
 * Fewer per bench means a side goes — and a side is a column of students. Which
 * one is the school's to say: it used to be the last side, silently, whatever
 * sat there. More per bench means a new, empty side — at the end, or between two
 * classes that should not sit shoulder to shoulder. Either way the question is
 * asked, with what it does to the students already seated, before anything is
 * saved.
 *
 *   request   { room, newWidth, exams, classesMap } — or null (closed)
 *               room    the room as saved (its `seats_per_bench` is the old width)
 *               exams   what sits on each side, exam by exam, newest first
 *   onDone    (sides | null) — the new bench left to right: the old side kept
 *             in each place, `null` for a new empty side; null when cancelled
 */
function BenchSidesDialog({ request, onDone }) {
    const open = !!request;
    const oldWidth = request?.room?.seats_per_bench || 0;
    const newWidth = request?.newWidth || 0;
    const removing = Math.max(0, oldWidth - newWidth);
    const adding = Math.max(0, newWidth - oldWidth);
    const exams = request?.exams || [];
    const classesMap = request?.classesMap;
    const latest = exams[0];

    // removing: the sides that go.  adding: for each new side, the old side it
    // comes after (0 = the left end).
    const [removed, setRemoved] = useState([]);
    const [after, setAfter] = useState([]);
    const cancelRef = useRef(null);

    useEffect(() => {
        if (!request) return;
        // A side nothing sits on, in any exam, costs nothing to remove: start
        // with those ticked, from the right. A side with students on it is
        // never ticked for the school.
        const empty = range(oldWidth).filter((s) => exams.every((plan) => !sideOf(plan, s))).reverse();
        setRemoved(empty.slice(0, removing));
        setAfter(Array.from({ length: adding }, () => oldWidth));
        // the safe option takes focus, not the one that changes seats
        const timer = setTimeout(() => cancelRef.current?.focus(), 40);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request]);

    // the new bench, left to right
    const sides = useMemo(() => {
        if (removing) return range(oldWidth).filter((s) => !removed.includes(s));
        const bench = [];
        for (let s = 0; s <= oldWidth; s++) {
            if (s > 0) bench.push(s);
            after.forEach((place) => { if (place === s) bench.push(null); });
        }
        return bench;
    }, [removing, oldWidth, removed, after]);

    // what the choice does, exam by exam: the seats and classes on a side that
    // goes — and on any side left over from an earlier, wider bench
    const effects = useMemo(() => exams.map((plan) => {
        const gone = (plan.sides || []).filter((s) => removed.includes(s.column) || s.column > oldWidth);
        return {
            label: examLabel(plan),
            seats: gone.reduce((n, s) => n + (s.seated || 0), 0),
            classes: [...new Set(gone.flatMap((s) => classNames(s, classesMap)))],
        };
    }).filter((e) => e.seats > 0 || e.classes.length > 0), [exams, removed, oldWidth, classesMap]);
    const seatsLost = effects.reduce((n, e) => n + e.seats, 0);

    function toggle(side) {
        setRemoved((list) => {
            if (list.includes(side)) return list.filter((s) => s !== side);
            // one side to remove: choosing another replaces the choice
            if (removing === 1) return [side];
            return list.length >= removing ? list : [...list, side];
        });
    }

    if (!open) return null;
    const ready = sides.length === newWidth;
    const description = (side) => {
        const names = classNames(sideOf(latest, side), classesMap);
        return names.length ? listed(names) : "No class on this side";
    };

    return (
        <Dialog open size="md" handler={() => onDone(null)} className="rounded-2xl" aria-labelledby="bench-sides-title">
            <DialogHeader className="flex items-start gap-3 pb-2">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--t-brand-tint)] text-[var(--t-brand-ink)]">
                    <ArrowsRightLeftIcon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex flex-col">
                    {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                    <span id="bench-sides-title" className="text-base font-semibold leading-6 text-[var(--ink-900)] break-words">
                        {request.room.name}: {oldWidth} → {newWidth} students per bench
                    </span>
                    <span className="text-[13px] font-normal leading-snug text-[var(--ink-600)]">
                        {removing
                            ? `This room already has classes on its sides. Choose the ${removing === 1 ? "side" : `${removing} sides`} to remove.`
                            : `This room already has classes on its sides. Choose where the new ${adding === 1 ? "side goes" : "sides go"}.`}
                    </span>
                </span>
            </DialogHeader>

            <DialogBody className="flex max-h-[65dvh] flex-col gap-y-4 overflow-y-auto pt-1 pb-3">
                {removing > 0 && (
                    <fieldset className="flex flex-col gap-y-1.5">
                        <legend className="mb-1.5 flex w-full items-baseline justify-between gap-x-2">
                            <span className="text-xs font-bold uppercase tracking-wide text-[var(--ink-600)]">The bench now{latest ? ` — ${examLabel(latest)}` : ""}</span>
                            <span className={`text-xs font-semibold ${ready ? "text-[#047857]" : "text-[#92400e]"}`} aria-live="polite">
                                {removed.length} of {removing} chosen
                            </span>
                        </legend>
                        {range(oldWidth).map((side) => {
                            const ticked = removed.includes(side);
                            const seated = sideOf(latest, side)?.seated || 0;
                            return (
                                <label key={side}
                                    className={`flex cursor-pointer items-center gap-x-3 rounded-lg border px-3 py-2 transition-colors duration-150
                                        ${ticked ? "border-[#fda4af] bg-[#fff1f2]" : "border-[var(--line)] bg-white hover:border-[var(--field-line-hover)]"}`}>
                                    <input type="checkbox" checked={ticked} onChange={() => toggle(side)}
                                        className="h-4 w-4 shrink-0 accent-[#e11d48]" aria-label={`Remove side ${side}: ${description(side)}`} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-semibold text-[var(--ink-900)]">Side {side}</span>
                                        <span className="block text-[13px] capitalize leading-snug text-[var(--ink-600)] break-words">{description(side)}</span>
                                    </span>
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${ticked && seated ? "bg-[#ffe4e6] text-[#be123c]" : "bg-[var(--surface-soft)] text-[var(--ink-600)]"}`}>
                                        {ticked ? (seated ? `${seated} lose their seat` : "removed") : `${seated} seated`}
                                    </span>
                                </label>
                            );
                        })}
                    </fieldset>
                )}

                {adding > 0 && after.map((place, i) => (
                    <fieldset key={i} className="flex flex-col gap-y-1.5">
                        <legend className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--ink-600)]">
                            {adding === 1 ? "The new side goes" : `New side ${i + 1} of ${adding} goes`}
                        </legend>
                        {[0, ...range(oldWidth)].map((side) => (
                            <label key={side}
                                className={`flex cursor-pointer items-center gap-x-3 rounded-lg border px-3 py-2 transition-colors duration-150
                                    ${place === side ? "border-[var(--t-brand-solid)] bg-[var(--t-brand-tint)]" : "border-[var(--line)] bg-white hover:border-[var(--field-line-hover)]"}`}>
                                <input type="radio" name={`new-side-${i}`} checked={place === side}
                                    onChange={() => setAfter((list) => list.map((p, j) => (j === i ? side : p)))}
                                    className="h-4 w-4 shrink-0 accent-[var(--t-brand-solid)]" />
                                <span className="min-w-0 text-sm text-[var(--ink-900)]">
                                    {side === 0
                                        ? <span className="text-sm font-semibold">At the left end</span>
                                        : (
                                            <>
                                                <span className="text-sm font-semibold">After side {side}</span>
                                                <span className="text-[13px] capitalize text-[var(--ink-600)]"> — {description(side)}</span>
                                                {side === oldWidth && <span className="text-[13px] text-[var(--ink-500)]"> (the right end)</span>}
                                            </>
                                        )}
                                </span>
                            </label>
                        ))}
                    </fieldset>
                ))}

                <div>
                    <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--ink-600)]">The bench after the change</div>
                    {ready ? (
                        <div className="flex flex-wrap items-stretch gap-1.5">
                            {sides.map((old, i) => {
                                const names = old === null ? [] : classNames(sideOf(latest, old), classesMap);
                                return (
                                    <div key={i}
                                        className={`min-w-[6.5rem] flex-1 rounded-md border px-2 py-1.5 ${old === null
                                            ? "border-dashed border-[var(--t-brand-solid)] bg-[var(--t-brand-tint)]" : "border-[var(--line)] bg-[var(--surface-soft)]"}`}>
                                        <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--ink-500)]">Side {i + 1}</span>
                                        <span className="block text-xs font-semibold capitalize leading-snug text-[var(--ink-900)] break-words">
                                            {old === null ? "New — empty" : names.length ? listed(names) : "No class"}
                                        </span>
                                        {old !== null && old !== i + 1 &&
                                            <span className="block text-[11px] text-[var(--ink-500)]">was side {old}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="text-[13px] text-[var(--ink-500)]">
                            Tick {plural(removing - removed.length, "more side")} above to see the bench.
                        </p>
                    )}
                </div>

                {/* what is about to change, before it does */}
                <div className={`rounded-lg border px-3 py-2.5 ${seatsLost ? "border-[#fda4af] bg-[#fff1f2]" : "border-[var(--line)] bg-[var(--surface-soft)]"}`} role="status">
                    <div className={`text-sm font-semibold ${seatsLost ? "text-[#9f1239]" : "text-[var(--ink-900)]"}`}>
                        {adding ? "No student loses a seat"
                            : !ready ? "Nothing changes until you choose"
                                : seatsLost ? `${plural(seatsLost, "student loses their seat", "students lose their seat")} in this room` : "No seated student is affected"}
                    </div>
                    {adding > 0 &&
                        <p className="mt-1 text-[13px] leading-snug text-[var(--ink-600)]">
                            Students already seated keep their bench and their neighbours. The new side stays empty until you choose a class for it in step 2.
                        </p>}
                    {removing > 0 && ready && effects.length > 0 && (
                        <ul className="mt-1 flex flex-col gap-y-0.5">
                            {effects.map((effect) => (
                                <li key={effect.label} className="text-[13px] leading-snug text-[var(--ink-700)]">
                                    <b className="text-[13px] font-semibold text-[var(--ink-900)]">{effect.label}:</b>{" "}
                                    <span className="text-[13px] capitalize">{listed(effect.classes)}</span>
                                    <span className="text-[13px]">
                                        {" "}{effect.classes.length === 1 ? "is" : "are"} no longer sent to this room
                                        {effect.seats ? ` — ${plural(effect.seats, "seat")} removed.` : "."}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {removing > 0 && ready && seatsLost > 0 &&
                        <p className="mt-1.5 text-[13px] leading-snug text-[var(--ink-700)]">
                            They are not deleted from the school — they are only without a seat, and show in step 2 so you can send them to another room. Everyone else keeps the same bench.
                        </p>}
                </div>
            </DialogBody>

            <DialogFooter className="gap-2 pt-0">
                <button ref={cancelRef} type="button" onClick={() => onDone(null)}
                    className="rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold text-[var(--ink-700)] transition hover:bg-[var(--surface-soft)]">
                    Cancel — change nothing
                </button>
                <button type="button" disabled={!ready} onClick={() => onDone(sides)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40
                        ${seatsLost ? "border-[#be123c] bg-[#e11d48] hover:bg-[#be123c]" : "border-[var(--t-brand-solid)] bg-[var(--t-brand-solid)] hover:opacity-90"}`}>
                    {adding ? "Add and save"
                        : `Remove side${removed.length === 1 ? "" : "s"} ${listed([...removed].sort((a, b) => a - b).map(String)) || "…"} and save`}
                </button>
            </DialogFooter>
        </Dialog>
    );
}

export default BenchSidesDialog;
