import { useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ArrowRightIcon, PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { ButtonsSecion, Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import EmptyState from "@/components/EmptyState";
import Loader from "@/components/Loader";
import { saveSeatPlanRoom, deleteSeatPlanRoom, getSeatPlanRoomSides } from "@/services/functions/exams/seatPlan";
import BenchSidesDialog from "./BenchSidesDialog";

export const MAX_BENCHES = 500;
// 30, not something smaller: schools have saved rooms with 27 and 30 here, and a
// lower cap would rewrite those rooms the next time they are edited.
export const MAX_SEATS_PER_BENCH = 30;
// The sizes of the room's text columns on the server. Typing stops at them,
// like a native maxLength: a longer note used to travel all the way to the
// database and come back as a bare "server error" with nothing saved.
const ROOM_NAME_MAX = 50;
const ROOM_NOTE_MAX = 200;
const TEXT_LIMITS = { name: ROOM_NAME_MAX, note: ROOM_NOTE_MAX };

const emptyRoom = () => ({ name: "", benches: 10, seats_per_bench: 2, note: "" });
const whole = (value, max) => Math.min(max, Math.max(1, Math.floor(Number(value)) || 1));

/**
 * Step 1: the school's rooms. A room is its name and its benches — nothing
 * about exams or classes is asked here, so ten rooms take a minute to enter.
 *
 *   rooms          the school's rooms (null while loading)
 *   classesBackup  the school's classes, to name what sits on a bench side
 *   onChanged      called after a room is added, changed or deleted
 *   onNext         go to step 2
 */
function RoomsSetup({ rooms, schoolId, classesBackup, updateNotification, onChanged, onNext }) {
    const [form, setForm] = useState(emptyRoom());
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState(false);
    const formRef = useRef(null);
    // the open "which side?" question: { room, newWidth, exams, classesMap, resolve }
    const [sidesRequest, setSidesRequest] = useState(null);
    const classesMap = useMemo(() => (classesBackup || []).reduce((acc, [, cls]) => {
        acc[cls.id] = cls.name;
        return acc;
    }, {}), [classesBackup]);

    // Changing "students per bench" of a room that already has classes or seats
    // on its sides: ask which side goes, or where the new one sits, first.
    // Answers with the new bench (see BenchSidesDialog), `undefined` when there
    // is nothing to ask, or `false` when the save must not go ahead.
    async function askSides(room, newWidth) {
        const exams = await getSeatPlanRoomSides(schoolId, room.id);
        if (!exams) {
            updateNotification(400, "Could not read what is seated in this room, so nothing was changed. Please try again.");
            return false;
        }
        if (!exams.some((plan) => (plan.sides || []).length > 0)) return undefined;
        const sides = await new Promise((resolve) => setSidesRequest({ room, newWidth, exams, classesMap, resolve }));
        setSidesRequest(null);
        return sides || false;
    }

    function onFormChange({ name, value }) {
        const limit = TEXT_LIMITS[name];
        setForm((s) => ({ ...s, [name]: limit && typeof value === "string" ? value.slice(0, limit) : value }));
    }
    const focusName = () => formRef.current?.querySelector('input[name="name"]')?.focus();

    function onCancel() {
        setForm(emptyRoom());
        setEditingId(null);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (busy) return;
        const name = `${form.name || ""}`.trim();
        if (!name) return updateNotification("", "Room name is required.");
        const payload = {
            id: editingId || undefined,
            school: schoolId,
            name,
            benches: whole(form.benches, MAX_BENCHES),
            seats_per_bench: whole(form.seats_per_bench, MAX_SEATS_PER_BENCH),
            note: form.note,
        };
        setBusy(true);
        const saved = editingId ? (rooms || []).find((r) => r.id === editingId) : null;
        if (saved && saved.seats_per_bench !== payload.seats_per_bench) {
            const sides = await askSides(saved, payload.seats_per_bench);
            if (sides === false) return setBusy(false);
            if (sides) payload.sides = sides;
        }
        const [status, message, data] = await saveSeatPlanRoom(payload);
        if (status === 200) {
            const wasEditing = !!editingId;
            // the next room is usually the same size: keep the numbers, clear the name
            setForm(wasEditing ? emptyRoom() : { ...emptyRoom(), benches: payload.benches, seats_per_bench: payload.seats_per_bench });
            setEditingId(null);
            // the list first, then the message: "added" should be true on screen
            await onChanged();
            const unseated = Number(data?.seats_removed) || 0;
            updateNotification(200, !wasEditing ? `${name} added — ${payload.benches * payload.seats_per_bench} seats.`
                : unseated ? `${name} updated. ${unseated} seat${unseated === 1 ? "" : "s"} removed — step 2 shows the students who now need one.`
                    : `${name} updated.`);
            focusName();
        } else {
            updateNotification(400, message || "Failed to save the room.");
        }
        setBusy(false);
    }

    function onEdit(room) {
        setForm({ name: room.name, benches: room.benches, seats_per_bench: room.seats_per_bench, note: room.note || "" });
        setEditingId(room.id);
        window.scrollTo({ top: 0, behavior: "smooth" });
        focusName();
    }

    async function onDelete(room) {
        if (busy) return;
        if (!await confirmAction({
            title: `Delete ${room.name}?`,
            body: "The room is removed from every exam's seat plan, and the students seated in it lose their seats there.",
        })) return;
        setBusy(true);
        const [status, message] = await deleteSeatPlanRoom(schoolId, room.id);
        if (status === 200) {
            if (editingId === room.id) onCancel();
            await onChanged();
            updateNotification(200, `${room.name} deleted.`);
        } else {
            updateNotification(400, message || "Failed to delete the room.");
        }
        setBusy(false);
    }

    const noteLength = `${form.note || ""}`.length;
    const seats = (rooms || []).reduce((n, r) => n + r.benches * r.seats_per_bench, 0);
    const draftSeats = whole(form.benches, MAX_BENCHES) * whole(form.seats_per_bench, MAX_SEATS_PER_BENCH);

    return (
        <>
            <form onSubmit={onSubmit} ref={formRef}>
                <Section title={editingId ? "Edit room" : "Add a room"}
                    description="Enter the room and how many benches it has. No exam is needed here — the same rooms are used for every exam."
                    className="!items-start">
                    <TextInput input={{ name: "name", label: "Room name / no.", placeholder: "e.g. Room 101", required: true }}
                        value={form.name} onChange={onFormChange} grid={4} />
                    <TextInput input={{ name: "benches", label: "No. of benches", type: "number", min: 1, max: MAX_BENCHES }}
                        value={form.benches} onChange={onFormChange} grid={2} />
                    <TextInput input={{ name: "seats_per_bench", label: "Students per bench", type: "number", min: 1, max: MAX_SEATS_PER_BENCH }}
                        value={form.seats_per_bench} onChange={onFormChange} grid={2} />
                    <TextInput input={{ name: "note", label: "Note (optional)" }} value={form.note} onChange={onFormChange} grid={4}
                        info={noteLength >= ROOM_NOTE_MAX - 30 ? `${noteLength} of ${ROOM_NOTE_MAX} characters used` : undefined} />
                    <BenchPreview benches={whole(form.benches, MAX_BENCHES)} perBench={whole(form.seats_per_bench, MAX_SEATS_PER_BENCH)} seats={draftSeats} />
                </Section>
                <ButtonsSecion>
                    {editingId && <Button variant="text" type="button" disabled={busy} onClick={onCancel}>Cancel</Button>}
                    <Button color="teal" type="submit" disabled={busy}>
                        {busy ? "Saving…" : editingId ? "Update room" : "Add room"}
                    </Button>
                </ButtonsSecion>
            </form>
            <BenchSidesDialog request={sidesRequest} onDone={(sides) => sidesRequest?.resolve(sides)} />

            {!rooms ? <Loader /> : rooms.length === 0 ? (
                <EmptyState title="No rooms yet" hint="Add the first room above. When all the rooms are in, go to step 2 to seat the students." />
            ) : (
                <div className="rounded-xl border border-[var(--line)] bg-white overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 border-b border-[var(--line)]">
                        <span className="text-sm font-semibold text-[var(--ink-900)]">
                            {rooms.length} room{rooms.length === 1 ? "" : "s"} <span className="text-sm font-normal text-[var(--ink-500)]">· {seats} seats in all</span>
                        </span>
                        <Button size="sm" color="teal" className="flex items-center gap-x-1.5" onClick={onNext}>
                            Next: seat students <ArrowRightIcon className="w-4 h-4" />
                        </Button>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-[var(--surface-soft)] [&_th]:px-3.5 [&_th]:py-2 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[var(--ink-500)]">
                                    <th className="w-10">#</th>
                                    <th>Room</th>
                                    <th className="text-right">Benches</th>
                                    <th className="text-right">Per bench</th>
                                    <th className="text-right">Seats</th>
                                    <th className="hidden md:table-cell">Note</th>
                                    <th className="w-24" aria-label="Actions"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {rooms.map((room, i) => (
                                    <tr key={room.id}
                                        className={`border-t border-[var(--line-soft)] transition-colors [&_td]:px-3.5 [&_td]:py-2 [&_td]:text-sm ${editingId === room.id ? "bg-[var(--t-brand-tint)]" : "hover:bg-[var(--surface-soft)]"}`}>
                                        <td className="text-[var(--ink-500)]">{i + 1}</td>
                                        <td className="font-semibold text-[var(--ink-900)] break-words">{room.name}</td>
                                        <td className="text-right text-[var(--ink-700)]">{room.benches}</td>
                                        <td className="text-right text-[var(--ink-700)]">{room.seats_per_bench}</td>
                                        <td className="text-right">
                                            <span className="inline-block min-w-[2.5rem] rounded-full bg-[var(--t-brand-tint)] px-2 py-0.5 text-center text-xs font-bold text-[var(--t-brand-ink)]">
                                                {room.benches * room.seats_per_bench}
                                            </span>
                                        </td>
                                        <td className="hidden md:table-cell text-[var(--ink-600)] break-words">{room.note}</td>
                                        <td>
                                            <span className="flex items-center justify-end gap-x-1">
                                                <button type="button" onClick={() => onEdit(room)} disabled={busy}
                                                    className="p-1.5 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:opacity-40" title="Edit room" aria-label={`Edit ${room.name}`}>
                                                    <PencilSquareIcon className="w-4 h-4" />
                                                </button>
                                                <button type="button" onClick={() => onDelete(room)} disabled={busy}
                                                    className="p-1.5 rounded bg-rose-50 text-rose-600 hover:bg-rose-100 disabled:opacity-40" title="Delete room" aria-label={`Delete ${room.name}`}>
                                                    <TrashIcon className="w-4 h-4" />
                                                </button>
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </>
    );
}

// What the numbers being typed mean, drawn: one bench with its seats, and the
// sum. "Students per bench" is the field people get wrong; a picture of a bench
// with that many seats on it settles it before the room is saved.
function BenchPreview({ benches, perBench, seats }) {
    const shown = Math.min(perBench, 8);
    return (
        <div className="sm:col-span-12 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-[var(--line)] bg-[var(--surface-soft)] px-3 py-2" aria-live="polite">
            <span className="flex items-center gap-x-1 rounded-md border border-[var(--field-line)] bg-white px-2 py-1.5" aria-hidden="true">
                {Array.from({ length: shown }, (_, i) => (
                    <span key={i} className="h-3 w-3 rounded-full bg-[var(--t-brand-solid)]"></span>
                ))}
                {perBench > shown && <span className="text-xs font-bold text-[var(--ink-600)]">+{perBench - shown}</span>}
            </span>
            <span className="text-sm text-[var(--ink-700)]">
                <span className="text-sm">one bench seats </span><b className="text-sm text-[var(--ink-900)]">{perBench}</b>
                <span className="text-sm"> · </span><b className="text-sm text-[var(--ink-900)]">{benches}</b><span className="text-sm"> bench{benches === 1 ? "" : "es"} = </span>
                <b className="text-sm text-[var(--t-brand-ink)]">{seats} seat{seats === 1 ? "" : "s"}</b><span className="text-sm"> in this room</span>
            </span>
        </div>
    );
}

export default RoomsSetup;
