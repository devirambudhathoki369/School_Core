import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { SelectInput, TextInput, SearchInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { fetchStaffs } from "@/services/functions/staffs";
import {
    deleteBlock, deleteHostel, deleteRoomType,
    getBlocks, getRoomTypes,
    saveBlock, saveHostel, saveRoomType,
} from "@/services/functions/hostel";
import { HOSTEL_TYPES, nameOf } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, rs, useHostelScope } from "../common";

const emptyHostel = () => ({ name: "", hostel_type: 3, address: "", contact: "", warden: "", remarks: "" });
const emptyBlock = () => ({ name: "", floors: 1, warden: "", remarks: "" });
const emptyType = () => ({
    name: "", bed_count: 1, monthly_fee: "", admission_fee: "", security_deposit: "",
    is_ac: false, remarks: "",
});

/**
 * HOSTEL SETUP — the residence itself, its blocks, and its room types.
 *
 * Rooms are a separate page: setting up a hostel happens once, adding rooms is
 * a job you come back to, and putting fifty rooms on the same screen as the
 * three fields that define the building makes both harder to find.
 *
 * The MONEY lives on the room type ("4-seater non-AC = Rs. 4,500/month"), so a
 * school prices its hostel once instead of on every room. What a particular
 * student pays is copied onto their allocation when they check in, and editing
 * a room type here NEVER re-prices anybody's existing stay — the note under the
 * form says so, because that is exactly the assumption that costs a school a
 * month of wrong bills.
 */
function HostelSetup() {
    const { notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading, reload } = useHostelScope();

    const [staffs, setStaffs] = useState([]);
    const [hostelForm, setHostelForm] = useState(emptyHostel());
    const [editingHostel, setEditingHostel] = useState(null);
    const [blocks, setBlocks] = useState([]);
    const [blockForm, setBlockForm] = useState(emptyBlock());
    const [editingBlock, setEditingBlock] = useState(null);
    const [types, setTypes] = useState([]);
    const [typeForm, setTypeForm] = useState(emptyType());
    const [editingType, setEditingType] = useState(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!school) return;
        (async () => {
            // `as_options` already returns [{name, value: staff.id}] — which is
            // exactly what the warden FK wants.
            const list = await fetchStaffs(school, true);
            setStaffs(Array.isArray(list) ? list : []);
        })();
    }, [school]);

    async function loadChildren() {
        if (!hostel) { setBlocks([]); setTypes([]); return; }
        const [b, t] = await Promise.all([
            getBlocks(school, hostel), getRoomTypes(school, hostel),
        ]);
        setBlocks(b); setTypes(t);
    }
    useEffect(() => { loadChildren(); /* eslint-disable-next-line */ }, [hostel]);

    /* ------------------------------------------------------------- hostel */
    async function onSaveHostel(e) {
        e.preventDefault();
        if (!hostelForm.name.trim()) return updateNotification("", "Hostel name is required.");
        setSaving(true);
        const [status, message] = await saveHostel({
            ...hostelForm, id: editingHostel || undefined, school,
            name: hostelForm.name.trim(), warden: hostelForm.warden || null,
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, editingHostel ? "Hostel updated!" : "Hostel added!");
            setHostelForm(emptyHostel()); setEditingHostel(null); reload();
        } else updateNotification(400, message || "Failed.");
    }
    function onEditHostel(h) {
        setHostelForm({
            name: h.name, hostel_type: h.hostel_type, address: h.address || "",
            contact: h.contact || "", warden: h.warden || "", remarks: h.remarks || "",
        });
        setEditingHostel(h.id);
    }
    async function onDeleteHostel(h) {
        if (!await confirmAction({
            title: `Remove ${h.name}?`, confirmText: "Remove",
            body: "A hostel that students have ever been allocated to cannot be removed — its history has to stay. "
                + "Only a hostel that was never used can be deleted.",
        })) return;
        const [status, message] = await deleteHostel(school, h.id);
        if (status === 200) { updateNotification(200, "Hostel removed!"); reload(); }
        else updateNotification(400, message || "In use.");
    }

    /* -------------------------------------------------------------- block */
    async function onSaveBlock(e) {
        e.preventDefault();
        if (!hostel) return updateNotification("", "Add a hostel first.");
        if (!blockForm.name.trim()) return updateNotification("", "Block name is required.");
        setSaving(true);
        const [status, message] = await saveBlock({
            ...blockForm, id: editingBlock || undefined, school, hostel,
            name: blockForm.name.trim(), warden: blockForm.warden || null,
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, editingBlock ? "Block updated!" : "Block added!");
            setBlockForm(emptyBlock()); setEditingBlock(null); loadChildren();
        } else updateNotification(400, message || "Failed.");
    }
    async function onDeleteBlock(b) {
        if (!await confirmAction({
            title: `Remove block ${b.name}?`, confirmText: "Remove",
            body: "A block that still has rooms in it cannot be removed. Move or delete its rooms first.",
        })) return;
        const [status, message] = await deleteBlock(school, b.id);
        if (status === 200) loadChildren();
        else updateNotification(400, message || "Still has rooms.");
    }

    /* ---------------------------------------------------------- room type */
    async function onSaveType(e) {
        e.preventDefault();
        if (!hostel) return updateNotification("", "Add a hostel first.");
        if (!typeForm.name.trim()) return updateNotification("", "Room type name is required.");
        setSaving(true);
        const [status, message] = await saveRoomType({
            ...typeForm, id: editingType || undefined, school, hostel,
            name: typeForm.name.trim(),
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, editingType ? "Room type updated!" : "Room type added!");
            setTypeForm(emptyType()); setEditingType(null); loadChildren();
        } else updateNotification(400, message || "Failed.");
    }
    function onEditType(t) {
        setTypeForm({
            name: t.name, bed_count: t.bed_count, monthly_fee: t.monthly_fee,
            admission_fee: t.admission_fee, security_deposit: t.security_deposit,
            is_ac: t.is_ac, remarks: t.remarks || "",
        });
        setEditingType(t.id);
    }
    async function onDeleteType(t) {
        if (!await confirmAction({
            title: `Remove room type ${t.name}?`, confirmText: "Remove",
            body: "Rooms still set to this type keep it — remove or re-type those rooms first.",
        })) return;
        const [status, message] = await deleteRoomType(school, t.id);
        if (status === 200) loadChildren();
        else updateNotification(400, message || "Still in use.");
    }

    if (loading) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            {/* ---------------------------------------------------- hostels */}
            <form onSubmit={onSaveHostel}>
                <Section title={editingHostel ? "Edit hostel" : "Add a hostel"}
                    description="A hostel is one residence the school runs. Most schools have one; a school with separate boys' and girls' residences adds both and runs them as two registers.">
                    <TextInput input={{ name: "name", label: "Hostel name", required: true }}
                        value={hostelForm.name}
                        onChange={({ value }) => setHostelForm((s) => ({ ...s, name: value }))} />
                    <SelectInput input={{ name: "hostel_type", label: "Type", options: HOSTEL_TYPES }}
                        value={hostelForm.hostel_type}
                        onChange={({ value }) => setHostelForm((s) => ({ ...s, hostel_type: value }))} />
                    <SearchInput input={{ name: "warden", label: "Warden", options: staffs }}
                        value={hostelForm.warden}
                        onChange={({ value }) => setHostelForm((s) => ({ ...s, warden: value }))} />
                    <TextInput input={{ name: "contact", label: "Contact" }} value={hostelForm.contact}
                        onChange={({ value }) => setHostelForm((s) => ({ ...s, contact: value }))} />
                    <TextInput input={{ name: "address", label: "Address" }} value={hostelForm.address}
                        onChange={({ value }) => setHostelForm((s) => ({ ...s, address: value }))} />
                </Section>
                <ButtonsSecion>
                    {editingHostel && <Button variant="text" type="button"
                        onClick={() => { setHostelForm(emptyHostel()); setEditingHostel(null); }}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={saving}>
                        {saving ? "Saving…" : editingHostel ? "Update hostel" : "Add hostel"}
                    </Button>
                </ButtonsSecion>
            </form>

            {hostels.length < 1 ? (
                <SetupNeeded what="hostels" where="the form above" />
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Hostel</th><th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">Warden</th><th className="px-3 py-2">Contact</th>
                                <th className="px-3 py-2 text-right">Rooms</th>
                                <th className="px-3 py-2 text-right">Occupied</th>
                                <th className="px-3 py-2 text-right">Vacant</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {hostels.map((h) => (
                                <tr key={h.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2 font-semibold">{h.name}</td>
                                    <td className="px-3 py-2">{h.hostel_type_name || nameOf(HOSTEL_TYPES, h.hostel_type)}</td>
                                    <td className="px-3 py-2">{h.warden_name || "—"}</td>
                                    <td className="px-3 py-2">{h.contact || "—"}</td>
                                    <td className="px-3 py-2 text-right">{h.rooms}</td>
                                    <td className="px-3 py-2 text-right font-bold">{h.occupied} / {h.capacity}</td>
                                    <td className="px-3 py-2 text-right">
                                        <StatusPill text={`${h.vacant} free`} tone={h.vacant > 0 ? "green" : "amber"} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            <button type="button" onClick={() => onEditHostel(h)}
                                                className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => onDeleteHostel(h)}
                                                className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {hostels.length > 0 && (
                <>
                    <HostelPicker options={options} value={hostel} onChange={setHostel} />

                    {/* ------------------------------------------ room types */}
                    <form onSubmit={onSaveType}>
                        <Section title={editingType ? "Edit room type" : "Room types & fees"}
                            description={
                                "What a room IS, and what living in one costs per month. Price the hostel here once — "
                                + "every room of this type inherits it.\n"
                                + "Editing a fee here NEVER changes what a current resident is billed: each student's rate "
                                + "was fixed when they checked in. New admissions get the new rate."
                            }>
                            <TextInput input={{ name: "name", label: "Room type (e.g. 4-Seater non-AC)", required: true }}
                                value={typeForm.name}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, name: value }))} />
                            <TextInput input={{ name: "bed_count", label: "Beds per room", type: "number" }}
                                value={typeForm.bed_count}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, bed_count: value }))} />
                            <TextInput input={{ name: "monthly_fee", label: "Monthly fee (Rs.)", type: "number" }}
                                value={typeForm.monthly_fee}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, monthly_fee: value }))} />
                            <TextInput input={{ name: "admission_fee", label: "One-time admission fee (Rs.)", type: "number" }}
                                value={typeForm.admission_fee}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, admission_fee: value }))} />
                            <TextInput input={{ name: "security_deposit", label: "Refundable deposit (Rs.)", type: "number" }}
                                value={typeForm.security_deposit}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, security_deposit: value }))} />
                            <SelectInput input={{ name: "is_ac", label: "Air conditioned", options: [{ value: false, name: "No" }, { value: true, name: "Yes" }] }}
                                value={typeForm.is_ac}
                                onChange={({ value }) => setTypeForm((s) => ({ ...s, is_ac: value === true || value === "true" }))} />
                        </Section>
                        <ButtonsSecion>
                            {editingType && <Button variant="text" type="button"
                                onClick={() => { setTypeForm(emptyType()); setEditingType(null); }}>Cancel</Button>}
                            <Button variant="outlined" type="submit" disabled={saving || !hostel}>
                                {editingType ? "Update room type" : "Add room type"}
                            </Button>
                        </ButtonsSecion>
                    </form>

                    {types.length < 1 ? <SetupNeeded what="room types" where="the form above" /> : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-table-header text-left">
                                    <tr>
                                        <th className="px-3 py-2">Room type</th><th className="px-3 py-2 text-right">Beds</th>
                                        <th className="px-3 py-2 text-right">Monthly</th><th className="px-3 py-2 text-right">Admission</th>
                                        <th className="px-3 py-2 text-right">Deposit</th><th className="px-3 py-2">AC</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {types.map((t) => (
                                        <tr key={t.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2 font-semibold">{t.name}</td>
                                            <td className="px-3 py-2 text-right">{t.bed_count}</td>
                                            <td className="px-3 py-2 text-right font-bold">Rs. {rs(t.monthly_fee)}</td>
                                            <td className="px-3 py-2 text-right">Rs. {rs(t.admission_fee)}</td>
                                            <td className="px-3 py-2 text-right">Rs. {rs(t.security_deposit)}</td>
                                            <td className="px-3 py-2">{t.is_ac ? "Yes" : "No"}</td>
                                            <td className="px-3 py-2">
                                                <div className="flex items-center justify-end gap-x-1">
                                                    <button type="button" onClick={() => onEditType(t)}
                                                        className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                                    <button type="button" onClick={() => onDeleteType(t)}
                                                        className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* ---------------------------------------------- blocks */}
                    <form onSubmit={onSaveBlock}>
                        <Section title={editingBlock ? "Edit block" : "Blocks (optional)"}
                            description="A wing or building inside the hostel. Only worth adding if the school actually talks about rooms that way — a small hostel can skip this entirely.">
                            <TextInput input={{ name: "name", label: "Block name" }} value={blockForm.name}
                                onChange={({ value }) => setBlockForm((s) => ({ ...s, name: value }))} />
                            <TextInput input={{ name: "floors", label: "Floors", type: "number" }} value={blockForm.floors}
                                onChange={({ value }) => setBlockForm((s) => ({ ...s, floors: value }))} />
                            <SearchInput input={{ name: "warden", label: "Block warden", options: staffs }}
                                value={blockForm.warden}
                                onChange={({ value }) => setBlockForm((s) => ({ ...s, warden: value }))} />
                        </Section>
                        <ButtonsSecion>
                            {editingBlock && <Button variant="text" type="button"
                                onClick={() => { setBlockForm(emptyBlock()); setEditingBlock(null); }}>Cancel</Button>}
                            <Button variant="outlined" type="submit" disabled={saving || !hostel}>
                                {editingBlock ? "Update block" : "Add block"}
                            </Button>
                        </ButtonsSecion>
                    </form>

                    {blocks.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {blocks.map((b) => (
                                <span key={b.id} className="inline-flex items-center gap-x-2 rounded-full bg-teal-50 border border-teal-200 px-3 py-1 text-sm">
                                    <span className="font-semibold">{b.name}</span>
                                    <span className="text-xs text-gray-500">{b.rooms} room(s) · {b.floors} floor(s)</span>
                                    <button type="button" onClick={() => { setBlockForm({ name: b.name, floors: b.floors, warden: b.warden || "", remarks: b.remarks || "" }); setEditingBlock(b.id); }}
                                        className="text-teal-700"><PencilSquareIcon className="w-3.5 h-3.5" /></button>
                                    <button type="button" onClick={() => onDeleteBlock(b)}
                                        className="text-rose-500 hover:text-rose-700"><TrashIcon className="w-3.5 h-3.5" /></button>
                                </span>
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default HostelSetup;
