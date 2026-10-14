import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { getRollCall, saveRollCall } from "@/services/functions/hostel";
import { ATTENDANCE_STATUSES, ATT_ABSENT, ATT_LATE, ATT_ON_LEAVE, ATT_PRESENT } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, useHostelScope } from "../common";

const TONE = { [ATT_PRESENT]: "green", [ATT_ABSENT]: "red", [ATT_ON_LEAVE]: "blue", [ATT_LATE]: "amber" };

/**
 * NIGHT ROLL CALL.
 *
 * The whole resident list is shown, already marked Present — a warden walking
 * the corridors is confirming exceptions, not entering forty names, and a
 * screen that starts empty gets filled in the morning from memory or not at all.
 *
 * Students on an approved gate pass covering tonight arrive pre-marked "On
 * leave" and are labelled as such, so nobody is asked to explain an absence the
 * office already signed off.
 *
 * Saving again for the same night is a CORRECTION, not a second register: the
 * backend keys on (student, date).
 */
function HostelAttendance() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [date, setDate] = useState(user?.today_npt || user?.today || "");
    const [rows, setRows] = useState([]);
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);

    async function load() {
        if (!hostel || !date) { setRows([]); return; }
        setFetching(true);
        const { residents } = await getRollCall(school, hostel, date);
        setRows(residents);
        setFetching(false);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel, date]);

    function setStatus(studentId, status) {
        setRows((s) => s.map((r) => r.student === studentId ? { ...r, status } : r));
    }
    function markAll(status) {
        setRows((s) => s.map((r) => ({ ...r, status })));
    }

    async function onSave(e) {
        e.preventDefault();
        if (rows.length < 1) return;
        setSaving(true);
        const [status, message] = await saveRollCall({
            school, hostel, date,
            entries: rows.map((r) => ({ student: r.student, status: r.status, remarks: r.remarks || null })),
        });
        setSaving(false);
        if (status === 200) { updateNotification(200, message || "Saved!"); load(); }
        else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const counts = rows.reduce((a, r) => ({ ...a, [r.status]: (a[r.status] || 0) + 1 }), {});
    const alreadySaved = rows.some((r) => r.saved);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <Section title="Night roll call"
                description={alreadySaved
                    ? "This night is already recorded. Changing anything and saving again corrects it — it does not create a second register."
                    : "Everyone starts marked Present. Change only the exceptions, then save."}>
                <TextInput input={{ name: "date", label: "Date (BS)" }} value={date}
                    onChange={({ value }) => setDate(value)} />
            </Section>

            {fetching ? <Loader /> : rows.length < 1 ? (
                <SetupNeeded what="residents in this hostel" where="Hostel > Residents" />
            ) : (
                <form onSubmit={onSave} className="flex flex-col gap-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        {ATTENDANCE_STATUSES.map((s) => (
                            <StatusPill key={s.value} text={`${s.name}: ${counts[s.value] || 0}`} tone={TONE[s.value]} />
                        ))}
                        <span className="ml-auto flex gap-2">
                            <Button size="sm" variant="text" type="button" onClick={() => markAll(ATT_PRESENT)}>All present</Button>
                            <Button size="sm" variant="text" type="button" onClick={() => markAll(ATT_ABSENT)}>All absent</Button>
                        </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left">
                                <tr>
                                    <th className="px-3 py-2">Student</th><th className="px-3 py-2">Room</th>
                                    <th className="px-3 py-2">Bed</th><th className="px-3 py-2">Mark</th>
                                    <th className="px-3 py-2">Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.student} className="border-t border-gray-100">
                                        <td className="px-3 py-2 font-semibold capitalize">
                                            {r.student_name}
                                            {r.on_leave && <span className="ml-2"><StatusPill text="gate pass" tone="blue" /></span>}
                                        </td>
                                        <td className="px-3 py-2">{r.room_no}{r.block_name ? ` (${r.block_name})` : ""}</td>
                                        <td className="px-3 py-2">{r.bed_no || "—"}</td>
                                        <td className="px-3 py-2">
                                            <div className="flex flex-wrap gap-1">
                                                {ATTENDANCE_STATUSES.map((s) => (
                                                    <button key={s.value} type="button" onClick={() => setStatus(r.student, s.value)}
                                                        className={`rounded px-2 py-1 text-[11px] font-semibold border ${
                                                            r.status === s.value
                                                                ? "border-teal-500 bg-teal-500 text-white"
                                                                : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"}`}>
                                                        {s.name}
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-3 py-2">
                                            <input value={r.remarks || ""} placeholder="optional"
                                                onChange={(e) => setRows((s) => s.map((x) =>
                                                    x.student === r.student ? { ...x, remarks: e.target.value } : x))}
                                                className="w-full rounded border border-gray-300 px-2 py-1 text-sm" />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <ButtonsSecion>
                        <Button color="teal" type="submit" disabled={saving}
                            className="rounded-lg normal-case font-semibold">
                            {saving ? "Saving…" : alreadySaved ? "Save corrections" : `Save roll call (${rows.length})`}
                        </Button>
                    </ButtonsSecion>
                </form>
            )}
        </div>
    );
}

export default HostelAttendance;
