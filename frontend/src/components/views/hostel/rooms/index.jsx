import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, TrashIcon, PlusIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import {
    deleteBed, deleteRoom, getBeds, getBlocks, getRoomTypes, getRooms, saveBed, saveRoom,
} from "@/services/functions/hostel";
import { OPTION_ALL } from "@/components/inputs";
import { ROOM_AVAILABLE, ROOM_STATUSES, nameOf } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, rs, useHostelScope } from "../common";

const emptyRoom = () => ({
    room_no: "", block: "", floor: 0, room_type: "", capacity: "", status: ROOM_AVAILABLE, remarks: "",
});

/**
 * ROOMS & BEDS.
 *
 * Occupancy on this screen is DERIVED from who currently lives where — there is
 * no stored count to drift. That is why a room can never read "full" with an
 * empty bed in it.
 *
 * Beds are created automatically when a room is added, numbered 1..capacity, so
 * bed-level allocation works from day one without a second setup pass. A school
 * that thinks in rooms rather than beds simply never opens the bed drawer.
 */
function HostelRooms() {
    const { notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [blocks, setBlocks] = useState([]);
    const [types, setTypes] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [filter, setFilter] = useState({ block: "", room_type: "" });
    const [form, setForm] = useState(emptyRoom());
    const [editingId, setEditingId] = useState(null);
    const [openBeds, setOpenBeds] = useState(null);
    const [beds, setBeds] = useState([]);
    const [newBed, setNewBed] = useState("");
    const [busy, setBusy] = useState(false);

    async function load() {
        if (!hostel) { setRooms([]); return; }
        const [b, t, r] = await Promise.all([
            getBlocks(school, hostel), getRoomTypes(school, hostel),
            getRooms(school, hostel, {
                block: filter.block || undefined, room_type: filter.room_type || undefined,
            }),
        ]);
        setBlocks(b); setTypes(t); setRooms(r);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, filter.block, filter.room_type]);

    function onFormChange({ name, value }) {
        setForm((s) => {
            const next = { ...s, [name]: value };
            // Picking a room type fills in the capacity it implies. Still
            // editable — real buildings always have one odd room.
            if (name === "room_type" && !editingId) {
                const t = types.find((x) => String(x.id) === String(value));
                if (t) next.capacity = t.bed_count;
            }
            return next;
        });
    }

    async function onSave(e) {
        e.preventDefault();
        if (!hostel) return updateNotification("", "Add a hostel first.");
        if (!form.room_no.trim()) return updateNotification("", "Room number is required.");
        setBusy(true);
        const [status, message] = await saveRoom({
            ...form, id: editingId || undefined, school, hostel,
            room_no: form.room_no.trim(),
            block: form.block || null, room_type: form.room_type || null,
        });
        setBusy(false);
        if (status === 200) {
            updateNotification(200, editingId ? "Room updated!" : "Room added!");
            setForm(emptyRoom()); setEditingId(null); load();
        } else updateNotification(400, message || "Failed.");
    }

    function onEdit(r) {
        setForm({
            room_no: r.room_no, block: r.block || "", floor: r.floor,
            room_type: r.room_type || "", capacity: r.capacity, status: r.status,
            remarks: r.remarks || "",
        });
        setEditingId(r.id);
    }

    async function onDelete(r) {
        if (!await confirmAction({
            title: `Remove room ${r.room_no}?`, confirmText: "Remove",
            body: r.occupied > 0
                ? `${r.occupied} student(s) live in this room right now. It cannot be removed.`
                : "A room that students have ever been allocated to cannot be removed — the record their hostel bills "
                  + "were raised against has to stay. Set it to Blocked instead if it is out of use.",
        })) return;
        const [status, message] = await deleteRoom(school, r.id);
        if (status === 200) { updateNotification(200, "Room removed!"); load(); }
        else updateNotification(400, message || "In use.");
    }

    async function openBedDrawer(room) {
        if (openBeds === room.id) { setOpenBeds(null); return; }
        setOpenBeds(room.id);
        setBeds(await getBeds(school, room.id));
    }
    async function onAddBed(roomId) {
        if (!newBed.trim()) return;
        const [status, message] = await saveBed({ school, room: roomId, bed_no: newBed.trim() });
        if (status === 200) { setNewBed(""); setBeds(await getBeds(school, roomId)); load(); }
        else updateNotification(400, message || "Failed.");
    }
    async function onDeleteBed(bed, roomId) {
        if (!await confirmAction({
            title: `Remove bed ${bed.bed_no}?`, confirmText: "Remove",
            body: bed.free ? "This bed is empty and will be removed."
                : `${bed.student_name} is in this bed. It cannot be removed until they move or check out.`,
        })) return;
        const [status, message] = await deleteBed(school, bed.id);
        if (status === 200) { setBeds(await getBeds(school, roomId)); load(); }
        else updateNotification(400, message || "Occupied.");
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const typeOptions = types.map((t) => ({ value: t.id, name: t.name }));
    const blockOptions = blocks.map((b) => ({ value: b.id, name: b.name }));

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <form onSubmit={onSave}>
                <Section title={editingId ? `Edit room ${form.room_no}` : "Add a room"}
                    description="Beds are numbered automatically to match the capacity, so a room is ready for bed-level allocation as soon as it is added.">
                    <TextInput input={{ name: "room_no", label: "Room no.", required: true }}
                        value={form.room_no} onChange={onFormChange} />
                    <SelectInput input={{ name: "block", label: "Block", options: [OPTION_ALL, ...blockOptions] }}
                        value={form.block} onChange={onFormChange} />
                    <TextInput input={{ name: "floor", label: "Floor", type: "number" }}
                        value={form.floor} onChange={onFormChange} />
                    <SelectInput input={{ name: "room_type", label: "Room type", options: typeOptions }}
                        value={form.room_type} onChange={onFormChange} />
                    <TextInput input={{ name: "capacity", label: "Beds", type: "number" }}
                        value={form.capacity} onChange={onFormChange} />
                    <SelectInput input={{ name: "status", label: "Status", options: ROOM_STATUSES }}
                        value={form.status} onChange={onFormChange} />
                </Section>
                <ButtonsSecion>
                    {editingId && <Button variant="text" type="button"
                        onClick={() => { setForm(emptyRoom()); setEditingId(null); }}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={busy || !hostel}>
                        {busy ? "Saving…" : editingId ? "Update room" : "Add room"}
                    </Button>
                </ButtonsSecion>
            </form>

            <Section title="Rooms" description="Occupancy is counted from who currently lives where — it is never stored, so it cannot drift.">
                <SelectInput input={{ name: "block", label: "Filter by block", options: [OPTION_ALL, ...blockOptions] }}
                    value={filter.block} onChange={({ value }) => setFilter((s) => ({ ...s, block: value }))} />
                <SelectInput input={{ name: "room_type", label: "Filter by type", options: [OPTION_ALL, ...typeOptions] }}
                    value={filter.room_type} onChange={({ value }) => setFilter((s) => ({ ...s, room_type: value }))} />
            </Section>

            {rooms.length < 1 ? <SetupNeeded what="rooms" where="the form above" /> : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Room</th><th className="px-3 py-2">Block</th>
                                <th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Monthly</th>
                                <th className="px-3 py-2 text-right">Occupied</th><th className="px-3 py-2">Status</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map((r) => (
                                <>
                                    <tr key={r.id} className={`border-t border-gray-100 ${r.vacant < 1 ? "bg-amber-50/40" : ""}`}>
                                        <td className="px-3 py-2 font-semibold">{r.room_no}
                                            {r.floor ? <span className="ml-1 text-[11px] text-gray-400">fl.{r.floor}</span> : null}</td>
                                        <td className="px-3 py-2">{r.block_name || "—"}</td>
                                        <td className="px-3 py-2">{r.room_type_name || "—"}</td>
                                        <td className="px-3 py-2 text-right">{r.monthly_fee ? `Rs. ${rs(r.monthly_fee)}` : "—"}</td>
                                        <td className="px-3 py-2 text-right font-bold">{r.occupied} / {r.capacity}</td>
                                        <td className="px-3 py-2">
                                            <StatusPill
                                                text={r.status === ROOM_AVAILABLE
                                                    ? (r.vacant > 0 ? `${r.vacant} free` : "Full")
                                                    : (r.status_name || nameOf(ROOM_STATUSES, r.status))}
                                                tone={r.status !== ROOM_AVAILABLE ? "gray" : r.vacant > 0 ? "green" : "amber"} />
                                        </td>
                                        <td className="px-3 py-2">
                                            <div className="flex items-center justify-end gap-x-1">
                                                <button type="button" onClick={() => openBedDrawer(r)}
                                                    className="px-2 py-1 rounded bg-blue-50 text-blue-700 text-xs font-semibold">
                                                    {openBeds === r.id ? "Hide beds" : `Beds (${r.beds})`}
                                                </button>
                                                <button type="button" onClick={() => onEdit(r)}
                                                    className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                                <button type="button" onClick={() => onDelete(r)}
                                                    className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                            </div>
                                        </td>
                                    </tr>
                                    {openBeds === r.id && (
                                        <tr key={`${r.id}-beds`} className="bg-gray-50 border-t border-gray-100">
                                            <td colSpan={7} className="px-3 py-3">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {beds.length < 1 && <span className="text-xs text-gray-400">No beds numbered in this room.</span>}
                                                    {beds.map((b) => (
                                                        <span key={b.id}
                                                            className={`inline-flex items-center gap-x-2 rounded-full border px-3 py-1 text-sm ${
                                                                b.free ? "bg-white border-gray-200" : "bg-teal-50 border-teal-200"}`}>
                                                            <span className="font-semibold">Bed {b.bed_no}</span>
                                                            <span className="text-xs text-gray-500">{b.free ? "free" : b.student_name}</span>
                                                            <button type="button" onClick={() => onDeleteBed(b, r.id)}
                                                                className="text-rose-500 hover:text-rose-700"><TrashIcon className="w-3.5 h-3.5" /></button>
                                                        </span>
                                                    ))}
                                                    <span className="inline-flex items-center gap-x-1">
                                                        <input value={newBed} onChange={(e) => setNewBed(e.target.value)}
                                                            placeholder="Bed no."
                                                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm" />
                                                        <button type="button" onClick={() => onAddBed(r.id)}
                                                            className="p-1.5 rounded bg-teal-50 text-teal-700"><PlusIcon className="w-4 h-4" /></button>
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default HostelRooms;
