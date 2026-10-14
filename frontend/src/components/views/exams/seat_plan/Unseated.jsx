import { useState } from "react";
import { Button } from "@material-tailwind/react";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

import { SearchInput } from "@/components/inputs";

/**
 * The students the plan has not seated yet, class by class, each with a picker
 * for where to put them — a side of a room that still has free seats. When
 * there is none, "Add a room" opens step 1.
 *
 *   pending  [{ id, name, left, total, placed }]  placed = already in some room
 *   targets  [{ room, roomName, column, free, others }]  sides with free seats;
 *            others = class ids sitting on the room's OTHER sides
 *   busy     some write is in flight (nothing may be clicked);
 *   seating  …and it is a seating, not a room being cleared
 */
function Unseated({ pending, targets, seatedTotal, roomCount, busy, seating = busy, onAssign, onNewRoom }) {
    const [choice, setChoice] = useState({});
    const leftTotal = pending.reduce((n, p) => n + p.left, 0);

    if (pending.length === 0) {
        if (!seatedTotal) return null;
        return (
            <div className="flex items-center gap-x-2 rounded-lg border border-[#6ee7b7] bg-[#ecfdf5] px-3 py-2.5 text-sm font-semibold text-[#065f46] print:hidden" role="status">
                <CheckCircleIcon className="w-5 h-5 shrink-0" />
                Everyone has a seat — {seatedTotal} student{seatedTotal === 1 ? "" : "s"} across {roomCount} room{roomCount === 1 ? "" : "s"}.
            </div>
        );
    }

    return (
        <div className="rounded-lg border border-[#fcd34d] bg-[#fffbeb] p-3 sm:p-4 print:hidden" role="status">
            <div className="flex items-start gap-x-2">
                <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-[#b45309] mt-0.5" />
                <div className="min-w-0">
                    <h3 className="font-bold text-[#78350f]">
                        {leftTotal} student{leftTotal === 1 ? " still needs" : "s still need"} a seat
                    </h3>
                    <p className="text-sm text-[#92400e]">
                        {targets.length > 0
                            ? "Choose a room with free seats for each class, or add another room in step 1."
                            : "Every room is full. Add another room in step 1, or give a room more benches there."}
                    </p>
                </div>
            </div>
            <ul className="mt-3 flex flex-col gap-y-2">
                {pending.map((p) => {
                    const value = choice[p.id] ?? "";
                    const picked = targets.find((t) => `${t.room}:${t.column}` === value);
                    const fits = picked ? Math.min(p.left, picked.free) : 0;
                    const sameClassBeside = !!picked?.others?.includes(p.id);
                    return (
                        <li key={p.id} className="rounded-md border border-[#fcd34d] bg-white px-3 py-2.5 flex flex-col gap-2 md:flex-row md:items-center">
                            <div className="min-w-0 md:flex-1">
                                <div className="font-semibold text-gray-900 capitalize">{p.name}</div>
                                <div className="text-xs text-gray-700">
                                    {p.placed
                                        ? <><b className="text-xs">{p.left}</b> of {p.total} students without a seat</>
                                        : <>All <b className="text-xs">{p.total}</b> students — not in any room yet</>}
                                    {picked && fits < p.left &&
                                        <span className="text-xs text-[#92400e] font-semibold"> • only {fits} fit there, {p.left - fits} will remain</span>}
                                </div>
                                {sameClassBeside &&
                                    <div className="text-xs font-semibold text-[#92400e]">
                                        This class already sits on another side of {picked.roomName} — they would share benches with their own classmates.
                                    </div>}
                            </div>
                            {targets.length > 0 ? (
                                <div className="min-w-0 md:w-72 [&_.app-field-label]:hidden [&_.app-picker-trigger]:mt-0">
                                    <SearchInput grid={12}
                                        input={{
                                            name: `room-for-${p.id}`, label: "room", hideLabel: true,
                                            placeholder: "Choose a room…", readOnly: busy,
                                            options: targets.map((t) => ({
                                                value: `${t.room}:${t.column}`,
                                                name: `${t.roomName} — Side ${t.column} (${t.free} free)`,
                                            })),
                                        }}
                                        value={value}
                                        onChange={({ value }) => setChoice((s) => ({ ...s, [p.id]: value }))} />
                                </div>
                            ) : (
                                <span className="text-xs font-semibold text-[#92400e]">No free seats in any room.</span>
                            )}
                            <div className="flex gap-2">
                                {targets.length > 0 &&
                                    <Button size="sm" color="teal" className="flex-1 md:flex-none" disabled={!picked || busy}
                                        onClick={() => onAssign(p.id, picked.room, picked.column, fits)}>
                                        {seating ? "Seating…" : "Seat here"}
                                    </Button>}
                                <Button size="sm" variant="outlined" className="flex-1 md:flex-none" disabled={busy}
                                    onClick={() => onNewRoom(p.id)}>
                                    Add a room
                                </Button>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default Unseated;
