import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { CheckIcon, TrashIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { OPTION_ALL, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { deleteLeave, getAllocations, getLeaves, saveLeave } from "@/services/functions/hostel";
import { LEAVE_APPROVED, LEAVE_STATUSES, LEAVE_TYPES, LEAVE_RETURNED } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, useHostelScope } from "../common";

const emptyLeave = () => ({
    student: "", leave_type: 1, from_date: "", to_date: "", out_time: "", in_time: "",
    reason: "", contact_during_leave: "", escorted_by: "", status: 2,
});

/**
 * GATE PASSES.
 *
 * The number that matters is OVERDUE: an approved pass whose return date has
 * passed with nobody marked back is a student the hostel cannot account for.
 * It is computed on the server (so this screen and the dashboard cannot
 * disagree) and it is the first thing on the page.
 *
 * "Mark returned" is one click and sends only that — a warden closing out ten
 * passes at the gate should not be re-submitting ten whole forms.
 */
function HostelLeaves() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [residents, setResidents] = useState([]);
    const [rows, setRows] = useState([]);
    const [filter, setFilter] = useState({ status: "", overdue_only: "" });
    const [form, setForm] = useState(emptyLeave());
    const [busy, setBusy] = useState(false);

    async function load() {
        if (!hostel) { setRows([]); setResidents([]); return; }
        const [regs, leaves] = await Promise.all([
            getAllocations(school, { hostel }),
            getLeaves(school, {
                hostel,
                status: filter.status || undefined,
                overdue_only: filter.overdue_only || undefined,
            }),
        ]);
        setResidents(regs.map((r) => ({
            value: r.student, name: `${r.student_name} — room ${r.room_no}`,
        })));
        setRows(leaves);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, filter.status, filter.overdue_only]);

    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }

    async function onSave(e) {
        e.preventDefault();
        if (!form.student) return updateNotification("", "Pick the student.");
        if (!form.from_date) return updateNotification("", "From date is required.");
        setBusy(true);
        const [status, message] = await saveLeave({
            ...form, school, hostel,
            to_date: form.to_date || form.from_date,
        });
        setBusy(false);
        if (status === 200) { updateNotification(200, message || "Gate pass saved!"); setForm(emptyLeave()); load(); }
        else updateNotification(400, message || "Failed.");
    }

    async function onMarkReturned(row) {
        const when = user?.today_npt || user?.today || "";
        const ok = await confirmAction({
            title: `Mark ${row.student_name} as returned?`,
            tone: "info",
            confirmText: "Mark returned",
            body: `Recorded as back on ${when}. The pass closes and they stop counting as away.`,
        });
        if (!ok) return;
        const [status, message] = await saveLeave({
            school, id: row.id, mark_returned: true, actual_return_date: when,
        });
        if (status === 200) { updateNotification(200, "Marked returned!"); load(); }
        else updateNotification(400, message || "Failed.");
    }

    async function onDelete(row) {
        const [status, message] = await deleteLeave(school, row.id);
        if (status === 200) load(); else if (message) updateNotification(400, message);
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const overdue = rows.filter((r) => r.overdue);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            {overdue.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                    <p className="font-semibold text-rose-800">
                        {overdue.length} student(s) are past their return date and not marked back
                    </p>
                    <p className="mt-1 text-sm text-rose-700">
                        {overdue.map((r) => `${r.student_name} (due ${r.to_date})`).join(" · ")}
                    </p>
                </div>
            )}

            <form onSubmit={onSave}>
                <Section title="Issue a gate pass"
                    description="Only students who currently live in this hostel can be given one.">
                    <SearchInput input={{ name: "student", label: "Student", options: residents, required: true }}
                        value={form.student} onChange={onChange} />
                    <SelectInput input={{ name: "leave_type", label: "Type", options: LEAVE_TYPES }}
                        value={form.leave_type} onChange={onChange} />
                    <TextInput input={{ name: "from_date", label: "From (BS)", required: true }}
                        value={form.from_date} onChange={onChange} />
                    <TextInput input={{ name: "to_date", label: "To (BS)" }} value={form.to_date} onChange={onChange} />
                    <TextInput input={{ name: "out_time", label: "Out time (HH:MM)" }} value={form.out_time} onChange={onChange} />
                    <TextInput input={{ name: "contact_during_leave", label: "Contact while away" }}
                        value={form.contact_during_leave} onChange={onChange} />
                    <TextInput input={{ name: "escorted_by", label: "Collected by" }} value={form.escorted_by} onChange={onChange} />
                    <SelectInput input={{ name: "status", label: "Status", options: LEAVE_STATUSES }}
                        value={form.status} onChange={onChange} />
                    <TextInput input={{ name: "reason", label: "Reason" }} value={form.reason} onChange={onChange} grid={8} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" type="submit" disabled={busy || !hostel}>
                        {busy ? "Saving…" : "Issue gate pass"}
                    </Button>
                </ButtonsSecion>
            </form>

            <Section title="Gate passes">
                <SelectInput input={{ name: "status", label: "Status", options: [OPTION_ALL, ...LEAVE_STATUSES] }}
                    value={filter.status} onChange={({ value }) => setFilter((s) => ({ ...s, status: value }))} />
                <SelectInput input={{ name: "overdue_only", label: "Show", options: [{ value: "", name: "All" }, { value: "true", name: "Overdue only" }] }}
                    value={filter.overdue_only} onChange={({ value }) => setFilter((s) => ({ ...s, overdue_only: value }))} />
            </Section>

            {rows.length < 1 ? (
                <p className="text-sm text-gray-500">No gate passes recorded.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Student</th><th className="px-3 py-2">Type</th>
                                <th className="px-3 py-2">From</th><th className="px-3 py-2">To</th>
                                <th className="px-3 py-2">Reason</th><th className="px-3 py-2">Contact</th>
                                <th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className={`border-t border-gray-100 ${r.overdue ? "bg-rose-50/60" : ""}`}>
                                    <td className="px-3 py-2 font-semibold capitalize">{r.student_name}</td>
                                    <td className="px-3 py-2">{r.leave_type_name}</td>
                                    <td className="px-3 py-2">{r.from_date}</td>
                                    <td className="px-3 py-2">{r.to_date}</td>
                                    <td className="px-3 py-2">{r.reason || "—"}</td>
                                    <td className="px-3 py-2">{r.contact_during_leave || "—"}</td>
                                    <td className="px-3 py-2">
                                        <StatusPill text={r.overdue ? "OVERDUE" : r.status_name}
                                            tone={r.overdue ? "red" : r.status === LEAVE_RETURNED ? "gray" : r.status === LEAVE_APPROVED ? "green" : "amber"} />
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            {r.status === LEAVE_APPROVED && !r.actual_return_date && (
                                                <button type="button" title="Mark returned" onClick={() => onMarkReturned(r)}
                                                    className="p-1.5 rounded bg-green-50 text-green-700"><CheckIcon className="w-4 h-4" /></button>
                                            )}
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

export default HostelLeaves;
