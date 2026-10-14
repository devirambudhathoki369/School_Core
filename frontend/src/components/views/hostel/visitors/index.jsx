import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ArrowRightOnRectangleIcon, TrashIcon } from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { OPTION_ALL, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { deleteVisitor, getAllocations, getVisitors, saveVisitor } from "@/services/functions/hostel";
import { HostelPicker, SetupNeeded, StatusPill, useHostelScope } from "../common";

const emptyVisitor = () => ({
    student: "", name: "", relation: "", contact: "", id_proof: "", persons: 1,
    purpose: "", in_time: "", out_time: "", remarks: "",
});

/**
 * THE GATE REGISTER.
 *
 * A TODAY screen by default. The whole history is thousands of rows and answers
 * a different question — "who visited in Mangsir" is a report, "who is inside
 * right now" is this page, and the count of people still inside sits at the top
 * because that is the one a guard is asked at closing time.
 */
function HostelVisitors() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [residents, setResidents] = useState([]);
    const [rows, setRows] = useState([]);
    const [date, setDate] = useState(user?.today_npt || user?.today || "");
    const [insideOnly, setInsideOnly] = useState("");
    const [form, setForm] = useState(emptyVisitor());
    const [busy, setBusy] = useState(false);

    async function load() {
        if (!hostel) { setRows([]); return; }
        const [regs, list] = await Promise.all([
            getAllocations(school, { hostel }),
            getVisitors(school, { hostel, date, inside_only: insideOnly || undefined }),
        ]);
        setResidents(regs.map((r) => ({ value: r.student, name: `${r.student_name} — room ${r.room_no}` })));
        setRows(list);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, date, insideOnly]);

    function onChange({ name, value }) { setForm((s) => ({ ...s, [name]: value })); }

    async function onSave(e) {
        e.preventDefault();
        if (!form.name.trim()) return updateNotification("", "Visitor name is required.");
        setBusy(true);
        const [status, message] = await saveVisitor({
            ...form, school, hostel, visit_date: date,
            student: form.student || null,
        });
        setBusy(false);
        if (status === 200) { updateNotification(200, "Visitor recorded!"); setForm(emptyVisitor()); load(); }
        else updateNotification(400, message || "Failed.");
    }

    async function onSignOut(row) {
        const [status, message] = await saveVisitor({ school, id: row.id, sign_out: true });
        if (status === 200) { updateNotification(200, "Signed out!"); load(); }
        else updateNotification(400, message || "Failed.");
    }
    async function onDelete(row) {
        const [status, message] = await deleteVisitor(school, row.id);
        if (status === 200) load(); else if (message) updateNotification(400, message);
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const inside = rows.filter((r) => r.inside);
    const heads = rows.reduce((a, r) => a + Number(r.persons || 1), 0);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <div className="flex flex-wrap gap-2">
                <StatusPill text={`${rows.length} visit(s) · ${heads} people`} tone="blue" />
                <StatusPill text={`${inside.length} still inside`} tone={inside.length > 0 ? "amber" : "green"} />
            </div>

            <form onSubmit={onSave}>
                <Section title="Sign a visitor in"
                    description="Leave the student blank for a visitor to the hostel itself — a supplier, an inspector.">
                    <TextInput input={{ name: "name", label: "Visitor name", required: true }} value={form.name} onChange={onChange} />
                    <SearchInput input={{ name: "student", label: "Visiting (student)", options: residents }}
                        value={form.student} onChange={onChange} />
                    <TextInput input={{ name: "relation", label: "Relation" }} value={form.relation} onChange={onChange} />
                    <TextInput input={{ name: "contact", label: "Contact" }} value={form.contact} onChange={onChange} />
                    <TextInput input={{ name: "id_proof", label: "ID shown" }} value={form.id_proof} onChange={onChange} />
                    <TextInput input={{ name: "persons", label: "People", type: "number" }} value={form.persons} onChange={onChange} />
                    <TextInput input={{ name: "in_time", label: "In time (HH:MM)" }} value={form.in_time} onChange={onChange} />
                    <TextInput input={{ name: "purpose", label: "Purpose" }} value={form.purpose} onChange={onChange} grid={8} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" type="submit" disabled={busy || !hostel}>
                        {busy ? "Saving…" : "Sign in"}
                    </Button>
                </ButtonsSecion>
            </form>

            <Section title="Gate register" description="Today's visitors. Change the date to look at another day.">
                <TextInput input={{ name: "date", label: "Date (BS)" }} value={date} onChange={({ value }) => setDate(value)} />
                <SelectInput input={{ name: "inside_only", label: "Show", options: [{ value: "", name: "All" }, { value: "true", name: "Still inside" }] }}
                    value={insideOnly} onChange={({ value }) => setInsideOnly(value)} />
            </Section>

            {rows.length < 1 ? (
                <p className="text-sm text-gray-500">No visitors recorded for this day.</p>
            ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-sm">
                        <thead className="bg-table-header text-left">
                            <tr>
                                <th className="px-3 py-2">Visitor</th><th className="px-3 py-2">Visiting</th>
                                <th className="px-3 py-2">Relation</th><th className="px-3 py-2">Contact</th>
                                <th className="px-3 py-2 text-right">People</th>
                                <th className="px-3 py-2">In</th><th className="px-3 py-2">Out</th>
                                <th className="px-3 py-2 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((r) => (
                                <tr key={r.id} className={`border-t border-gray-100 ${r.inside ? "bg-amber-50/40" : ""}`}>
                                    <td className="px-3 py-2 font-semibold capitalize">{r.name}</td>
                                    <td className="px-3 py-2 capitalize">{r.student_name || "—"}</td>
                                    <td className="px-3 py-2">{r.relation || "—"}</td>
                                    <td className="px-3 py-2">{r.contact || "—"}</td>
                                    <td className="px-3 py-2 text-right">{r.persons}</td>
                                    <td className="px-3 py-2">{r.in_time || "—"}</td>
                                    <td className="px-3 py-2">
                                        {r.out_time || <StatusPill text="inside" tone="amber" />}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-end gap-x-1">
                                            {r.inside && (
                                                <button type="button" title="Sign out" onClick={() => onSignOut(r)}
                                                    className="p-1.5 rounded bg-green-50 text-green-700"><ArrowRightOnRectangleIcon className="w-4 h-4" /></button>
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

export default HostelVisitors;
