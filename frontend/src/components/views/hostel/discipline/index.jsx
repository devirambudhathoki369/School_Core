import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PencilSquareIcon, TrashIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { fetchStaffs } from "@/services/functions/staffs";
import {
    deleteDisciplineRecord, getAllocations, getDisciplineRecords, saveDisciplineRecord,
} from "@/services/functions/hostel";
import { PRIORITIES } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, useHostelScope } from "../common";

const emptyRecord = () => ({
    student: "", date: "", severity: 2, description: "", action_taken: "",
    reported_by: "", guardian_informed: false,
});

/**
 * THE INCIDENT REGISTER.
 *
 * Its own register rather than a complaint category, because a discipline note
 * is about a STUDENT and follows them, while a complaint is about a room and
 * closes when the tap is fixed. Mixing them means the boy who broke a window
 * disappears from view the moment the window is replaced.
 *
 * "Guardian informed" is a field, not a note: it is the question asked first
 * when an incident becomes a dispute.
 */
function HostelDiscipline() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [residents, setResidents] = useState([]);
    const [staffs, setStaffs] = useState([]);
    const [rows, setRows] = useState([]);
    const [range, setRange] = useState({ from: "", to: "" });
    const [form, setForm] = useState(emptyRecord());
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
        const [regs, list] = await Promise.all([
            getAllocations(school, { hostel }),
            getDisciplineRecords(school, {
                hostel, from: range.from || undefined, to: range.to || undefined,
            }),
        ]);
        setResidents(regs.map((r) => ({ value: r.student, name: `${r.student_name} — room ${r.room_no}` })));
        setRows(list);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, range.from, range.to]);

    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }
    function reset() { setForm(emptyRecord()); setEditingId(null); }

    async function onSave(e) {
        e.preventDefault();
        if (!form.student) return updateNotification("", "Pick the student.");
        if (!form.description.trim()) return updateNotification("", "Describe what happened.");
        setBusy(true);
        const [status, message] = await saveDisciplineRecord({
            ...form, id: editingId || undefined, school, hostel,
            date: form.date || user?.today_npt || user?.today,
            reported_by: form.reported_by || null,
        });
        setBusy(false);
        if (status === 200) { updateNotification(200, message || "Saved!"); reset(); load(); }
        else updateNotification(400, message || "Failed.");
    }
    function onEdit(r) {
        setForm({
            student: r.student, date: r.date, severity: r.severity,
            description: r.description, action_taken: r.action_taken || "",
            reported_by: r.reported_by || "", guardian_informed: Boolean(r.guardian_informed),
        });
        setEditingId(r.id);
    }
    async function onDelete(r) {
        const [status, message] = await deleteDisciplineRecord(school, r.id);
        if (status === 200) load(); else if (message) updateNotification(400, message);
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <form onSubmit={onSave}>
                <Section title={editingId ? "Update record" : "Record an incident"}
                    description="Kept against the student, so their record travels with them across rooms and years.">
                    <SearchInput input={{ name: "student", label: "Student", options: residents, required: true }}
                        value={form.student} onChange={onChange} />
                    <TextInput input={{ name: "date", label: "Date (BS)" }} value={form.date} onChange={onChange} />
                    <SelectInput input={{ name: "severity", label: "Severity", options: PRIORITIES }} value={form.severity} onChange={onChange} />
                    <SearchInput input={{ name: "reported_by", label: "Reported by", options: staffs }} value={form.reported_by} onChange={onChange} />
                    <SelectInput input={{ name: "guardian_informed", label: "Guardian informed", options: [{ value: false, name: "No" }, { value: true, name: "Yes" }] }}
                        value={form.guardian_informed}
                        onChange={({ value }) => setForm((s) => ({ ...s, guardian_informed: value === true || value === "true" }))} />
                    <TextInput input={{ name: "description", label: "What happened", required: true }} value={form.description} onChange={onChange} grid={12} />
                    <TextInput input={{ name: "action_taken", label: "Action taken" }} value={form.action_taken} onChange={onChange} grid={12} />
                </Section>
                <ButtonsSecion>
                    {editingId && <Button variant="text" type="button" onClick={reset}>Cancel</Button>}
                    <Button variant="outlined" type="submit" disabled={busy || !hostel}>
                        {busy ? "Saving…" : editingId ? "Update" : "Save record"}
                    </Button>
                </ButtonsSecion>
            </form>

            <Section title="Incident register">
                <TextInput input={{ name: "from", label: "From (BS)" }} value={range.from} onChange={({ value }) => setRange((s) => ({ ...s, from: value }))} />
                <TextInput input={{ name: "to", label: "To (BS)" }} value={range.to} onChange={({ value }) => setRange((s) => ({ ...s, to: value }))} />
            </Section>

            {rows.length < 1 ? (
                <p className="text-sm text-gray-500">Nothing recorded.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Date</th><th className="px-3 py-2">Student</th>
                                <th className="px-3 py-2">Room</th><th className="px-3 py-2">Incident</th>
                                <th className="px-3 py-2">Severity</th><th className="px-3 py-2">Guardian</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className="border-t border-gray-100">
                                    <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                                    <td className="px-3 py-2 font-semibold capitalize">{r.student_name}</td>
                                    <td className="px-3 py-2">{r.room_no || "—"}</td>
                                    <td className="px-3 py-2">
                                        {r.description}
                                        {r.action_taken && <p className="text-xs text-gray-500">Action: {r.action_taken}</p>}
                                    </td>
                                    <td className="px-3 py-2">
                                        <StatusPill text={r.severity_name}
                                            tone={r.severity === 3 ? "red" : r.severity === 2 ? "amber" : "gray"} />
                                    </td>
                                    <td className="px-3 py-2">{r.guardian_informed ? "Informed" : "—"}</td>
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

export default HostelDiscipline;
