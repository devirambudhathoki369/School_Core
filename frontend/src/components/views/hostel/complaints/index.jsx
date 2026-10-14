import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { OPTION_ALL, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { fetchStaffs } from "@/services/functions/staffs";
import {
    deleteComplaint, getAllocations, getComplaints, getRooms, saveComplaint,
} from "@/services/functions/hostel";
import {
    COMPLAINT_CATEGORIES, COMPLAINT_RESOLVED, COMPLAINT_STATUSES, PRIORITIES,
} from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, useHostelScope } from "../common";

const emptyComplaint = () => ({
    room: "", student: "", category: 1, priority: 2, title: "", description: "",
    assigned_to: "", status: 1, resolution: "",
});

/**
 * COMPLAINTS — maintenance requests and grievances.
 *
 * Sorted open-first, then by priority: a register that reads newest-first buries
 * the leaking tap under a week of closed tickets.
 *
 * Closing one stamps its resolved date on the server. Asking a warden to type
 * today's date to close a ticket is how half a register ends up with an empty
 * resolved date and no way to say how long anything took.
 */
function HostelComplaints() {
    const { notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [rooms, setRooms] = useState([]);
    const [residents, setResidents] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const [rows, setRows] = useState([]);
    const [filter, setFilter] = useState({ status: "", category: "" });
    const [form, setForm] = useState(emptyComplaint());
    const [editingId, setEditingId] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!school) return;
        (async () => {
            const list = await fetchStaffs(school, true);
            setStaffs(Array.isArray(list) ? list : []);
        })();
    }, [school]);

    async function load() {
        if (!hostel) { setRows([]); return; }
        const [rms, regs, list] = await Promise.all([
            getRooms(school, hostel),
            getAllocations(school, { hostel }),
            getComplaints(school, {
                hostel, status: filter.status || undefined, category: filter.category || undefined,
            }),
        ]);
        setRooms(rms.map((r) => ({ value: r.id, name: `${r.room_no}${r.block_name ? ` (${r.block_name})` : ""}` })));
        setResidents(regs.map((r) => ({ value: r.student, name: `${r.student_name} — room ${r.room_no}` })));
        setRows(list);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, filter.status, filter.category]);

    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }
    function reset() { setForm(emptyComplaint()); setEditingId(null); }

    async function onSave(e) {
        e.preventDefault();
        if (!form.title.trim()) return updateNotification("", "A short title is required.");
        setBusy(true);
        const [status, message] = await saveComplaint({
            ...form, id: editingId || undefined, school, hostel,
            room: form.room || null, student: form.student || null,
            assigned_to: form.assigned_to || null,
        });
        setBusy(false);
        if (status === 200) { updateNotification(200, message || "Saved!"); reset(); load(); }
        else updateNotification(400, message || "Failed.");
    }

    function onEdit(r) {
        setForm({
            room: r.room || "", student: r.student || "", category: r.category,
            priority: r.priority, title: r.title, description: r.description || "",
            assigned_to: r.assigned_to || "", status: r.status, resolution: r.resolution || "",
        });
        setEditingId(r.id);
    }
    async function onDelete(r) {
        const [status, message] = await deleteComplaint(school, r.id);
        if (status === 200) load(); else if (message) updateNotification(400, message);
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const open = rows.filter((r) => r.status === 1 || r.status === 2);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <div className="flex flex-wrap gap-2">
                <StatusPill text={`${open.length} open`} tone={open.length > 0 ? "amber" : "green"} />
                <StatusPill text={`${rows.length - open.length} closed`} tone="gray" />
            </div>

            <form onSubmit={onSave}>
                <Section title={editingId ? "Update complaint" : "Log a complaint"}
                    description="Setting the status to Resolved or Closed stamps the date automatically.">
                    <TextInput input={{ name: "title", label: "What is wrong", required: true }} value={form.title} onChange={onChange} grid={8} />
                    <SelectInput input={{ name: "category", label: "Category", options: COMPLAINT_CATEGORIES }} value={form.category} onChange={onChange} />
                    <SelectInput input={{ name: "priority", label: "Priority", options: PRIORITIES }} value={form.priority} onChange={onChange} />
                    <SearchInput input={{ name: "room", label: "Room", options: rooms }} value={form.room} onChange={onChange} />
                    <SearchInput input={{ name: "student", label: "Raised by (student)", options: residents }} value={form.student} onChange={onChange} />
                    <SearchInput input={{ name: "assigned_to", label: "Assigned to", options: staffs }} value={form.assigned_to} onChange={onChange} />
                    <SelectInput input={{ name: "status", label: "Status", options: COMPLAINT_STATUSES }} value={form.status} onChange={onChange} />
                    <TextInput input={{ name: "description", label: "Details" }} value={form.description} onChange={onChange} grid={12} />
                    {form.status >= COMPLAINT_RESOLVED && (
                        <TextInput input={{ name: "resolution", label: "What was done" }} value={form.resolution} onChange={onChange} grid={12} />
                    )}
                </Section>
                <ButtonsSecion>
                    {editingId && <Button variant="text" type="button" onClick={reset}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={busy || !hostel}>
                        {busy ? "Saving…" : editingId ? "Update" : "Log complaint"}
                    </Button>
                </ButtonsSecion>
            </form>

            <Section title="Complaint register" description="Open ones first, highest priority at the top.">
                <SelectInput input={{ name: "status", label: "Status", options: [OPTION_ALL, ...COMPLAINT_STATUSES] }}
                    value={filter.status} onChange={({ value }) => setFilter((s) => ({ ...s, status: value }))} />
                <SelectInput input={{ name: "category", label: "Category", options: [OPTION_ALL, ...COMPLAINT_CATEGORIES] }}
                    value={filter.category} onChange={({ value }) => setFilter((s) => ({ ...s, category: value }))} />
            </Section>

            {rows.length < 1 ? (
                <p className="text-sm text-gray-500">Nothing logged.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Complaint</th><th className="px-3 py-2">Category</th>
                                <th className="px-3 py-2">Room</th><th className="px-3 py-2">Raised by</th>
                                <th className="px-3 py-2">Assigned</th><th className="px-3 py-2">Reported</th>
                                <th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className={`border-t border-gray-100 ${r.priority === 3 && r.status < 3 ? "bg-rose-50/40" : ""}`}>
                                    <td className="px-3 py-2">
                                        <span className="font-semibold">{r.title}</span>
                                        {r.priority === 3 && r.status < 3 && <span className="ml-2"><StatusPill text="high" tone="red" /></span>}
                                        {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                                    </td>
                                    <td className="px-3 py-2">{r.category_name}</td>
                                    <td className="px-3 py-2">{r.room_no || "—"}</td>
                                    <td className="px-3 py-2 capitalize">{r.student_name || "—"}</td>
                                    <td className="px-3 py-2 capitalize">{r.assigned_to_name?.trim() || "—"}</td>
                                    <td className="px-3 py-2">{r.reported_date}</td>
                                    <td className="px-3 py-2">
                                        <StatusPill text={r.status_name}
                                            tone={r.status === 1 ? "amber" : r.status === 2 ? "blue" : "green"} />
                                        {r.resolved_date && <p className="mt-1 text-[10px] text-gray-400">{r.resolved_date}</p>}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            <button type="button" onClick={() => onEdit(r)}
                                                className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                            <button type="button" onClick={() => onDelete(r)}
                                                className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default HostelComplaints;
