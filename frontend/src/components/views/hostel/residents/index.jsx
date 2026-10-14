import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ArrowRightIcon, ArrowLeftOnRectangleIcon, PencilSquareIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { OPTION_ALL, SelectInput, TextInput, SearchInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { selectAction } from "@/components/tables/actions";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import {
    admitStudents, checkoutResidents, getAdmissionCandidates, getAllocations,
    getBeds, getRooms, transferResident, updateAllocation,
} from "@/services/functions/hostel";
import { ALLOCATION_STATUSES, ALLOC_ACTIVE } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, StatusPill, rs, useHostelScope } from "../common";

/**
 * RESIDENTS — admitting students, moving them, checking them out.
 *
 * This is the screen the whole module exists for, so three decisions are worth
 * spelling out:
 *
 * · ADMISSION IS BULK BY DEFAULT. A warden admitting forty boarders one dialog
 *   at a time is how a residency register ends up being kept in a notebook. You
 *   filter to a class, tick the students, pick a room, and admit them together.
 *   The server fills beds in order and tells you, per student, what happened —
 *   it is deliberately not all-or-nothing, so one already-housed student cannot
 *   throw away thirty-nine correct admissions.
 *
 * · MOVING SOMEBODY IS NOT AN EDIT. "Transfer" closes the current stay and
 *   opens a new one, so "who was in room 12 in Mangsir" stays answerable. Only
 *   the TERMS of a stay (its fee, deposit, emergency contact) are editable in
 *   place.
 *
 * · THE FEE IS THE BILL. `monthly_fee` here is the same number the student's
 *   ledger charges as the "hostel" title — one number, read twice. A concession
 *   is given by lowering it on that student's stay, which is why there is no
 *   separate hostel-discount screen.
 */
function HostelResidents() {
    const { user: { user }, notification: { updateNotification },
        fiscalYear: { year } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [rooms, setRooms] = useState([]);
    const [residents, setResidents] = useState([]);
    const [showHistory, setShowHistory] = useState(false);
    const [busy, setBusy] = useState(false);

    // admission
    const [selectedClass, setSelectedClass] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [picked, setPicked] = useState([]);
    const [admitForm, setAdmitForm] = useState({ room: "", bed: "", check_in_date: "", monthly_fee: "" });
    const [freeBeds, setFreeBeds] = useState([]);

    // edit / transfer
    const [editing, setEditing] = useState(null);
    const [moving, setMoving] = useState(null);
    const [moveForm, setMoveForm] = useState({ room: "", bed: "", date: "", monthly_fee: "" });
    const [moveBeds, setMoveBeds] = useState([]);

    const academicYear = year?.academic_year;

    async function loadRegister() {
        if (!hostel) { setResidents([]); return; }
        const [rms, regs] = await Promise.all([
            getRooms(school, hostel),
            getAllocations(school, { hostel, status: showHistory ? "all" : undefined }),
        ]);
        setRooms(rms);
        setResidents(regs);
    }
    useEffect(() => { loadRegister(); /* eslint-disable-next-line */ }, [hostel, showHistory]);

    // Rooms with space, shown with how much space they have — so nobody picks a
    // full room and finds out on submit.
    const roomOptions = useMemo(() => rooms
        .filter((r) => r.allocatable)
        .map((r) => ({
            value: r.id,
            name: `${r.room_no}${r.block_name ? ` (${r.block_name})` : ""} — ${r.vacant} free`
                + (r.monthly_fee ? ` · Rs. ${rs(r.monthly_fee)}` : ""),
        })), [rooms]);
    const allRoomOptions = useMemo(() => rooms.map((r) => ({
        value: r.id, name: `${r.room_no}${r.block_name ? ` (${r.block_name})` : ""}`,
    })), [rooms]);

    /* ------------------------------------------------------- admission */
    // ChooseClass hands back (action, id, item) like every other class picker
    // in the app — same shape here so the control behaves the way a user has
    // already learnt it does on the attendance and report screens.
    async function onClassSelect(action, id, cls) {
        setSelectedClass(cls);
        await findCandidates(cls?.class_info?.id);
    }
    async function findCandidates(class_info) {
        setBusy(true);
        const list = await getAdmissionCandidates(school, {
            class_info: class_info || undefined,
            academic_year: academicYear || undefined,
        });
        setBusy(false);
        setCandidates(list);
        setPicked([]);
        if (list.length < 1) {
            updateNotification("", "Nobody left to admit here — everyone in this class already has a hostel place.");
        }
    }

    async function onPickRoom(roomId) {
        setAdmitForm((s) => ({ ...s, room: roomId, bed: "" }));
        const room = rooms.find((r) => String(r.id) === String(roomId));
        // Default the fee to the room's own rate, but leave it editable: a
        // concession is just a lower number here.
        setAdmitForm((s) => ({ ...s, monthly_fee: room?.monthly_fee ?? "" }));
        setFreeBeds(roomId ? await getBeds(school, roomId, { free_only: true, as_options: true }) : []);
    }

    function togglePick(id) {
        setPicked((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
    }

    async function onAdmit(e) {
        e.preventDefault();
        if (!admitForm.room) return updateNotification("", "Pick a room.");
        if (picked.length < 1) return updateNotification("", "Tick at least one student.");
        if (!academicYear) return updateNotification("", "No academic year selected — pick one at the top right.");
        const room = rooms.find((r) => String(r.id) === String(admitForm.room));
        if (room && picked.length > room.vacant) {
            const ok = await confirmAction({
                title: `Room ${room.room_no} has only ${room.vacant} free bed(s)`,
                tone: "warning",
                confirmText: `Admit ${room.vacant}`,
                body: `You picked ${picked.length} student(s). The first ${room.vacant} will be admitted and the rest `
                    + `will be reported as skipped — nobody is admitted twice and no bed is doubled up.`,
            });
            if (!ok) return;
        }
        setBusy(true);
        const [status, message, data] = await admitStudents({
            school, hostel, room: admitForm.room,
            bed: picked.length === 1 ? (admitForm.bed || null) : null,
            students: picked,
            academic_year: academicYear,
            check_in_date: admitForm.check_in_date || undefined,
            monthly_fee: admitForm.monthly_fee === "" ? undefined : admitForm.monthly_fee,
        });
        setBusy(false);
        if (status === 200) {
            updateNotification(200, message || "Admitted!");
            setPicked([]); setCandidates([]); loadRegister();
            if (data?.skipped?.length > 0) {
                // Say WHO was skipped and why — a count alone leaves the warden
                // to work out which of forty names did not go through.
                const names = data.skipped.map((s) => {
                    const c = candidates.find((x) => x.id === s.student);
                    return `${c?.name || s.student}: ${s.reason}`;
                }).join("\n");
                await confirmAction({
                    title: `${data.skipped.length} student(s) were not admitted`, body: names,
                    tone: "warning", confirmText: "OK", cancelText: "Close",
                });
            }
        } else updateNotification(400, message || "Failed.");
    }

    /* ----------------------------------------------------- edit terms */
    async function onSaveTerms(e) {
        e.preventDefault();
        setBusy(true);
        const [status, message] = await updateAllocation({ school, ...editing });
        setBusy(false);
        if (status === 200) { updateNotification(200, "Updated!"); setEditing(null); loadRegister(); }
        else updateNotification(400, message || "Failed.");
    }

    /* -------------------------------------------------------- transfer */
    async function onOpenMove(row) {
        setMoving(row);
        setMoveForm({ room: "", bed: "", date: "", monthly_fee: "" });
        setMoveBeds([]);
    }
    async function onMoveRoom(roomId) {
        setMoveForm((s) => ({ ...s, room: roomId, bed: "" }));
        setMoveBeds(roomId ? await getBeds(school, roomId, { free_only: true, as_options: true }) : []);
    }
    async function onTransfer(e) {
        e.preventDefault();
        if (!moveForm.room) return updateNotification("", "Pick the new room.");
        setBusy(true);
        const [status, message] = await transferResident({
            school, allocation: moving.id, room: moveForm.room,
            bed: moveForm.bed || null, date: moveForm.date || undefined,
            monthly_fee: moveForm.monthly_fee === "" ? undefined : moveForm.monthly_fee,
        });
        setBusy(false);
        if (status === 200) { updateNotification(200, message || "Transferred!"); setMoving(null); loadRegister(); }
        else updateNotification(400, message || "Failed.");
    }

    /* -------------------------------------------------------- checkout */
    async function onCheckout(row) {
        const ok = await confirmAction({
            title: `Check ${row.student_name} out of room ${row.room_no}?`,
            tone: "warning",
            confirmText: "Check out",
            body: "Their stay is closed and the bed is freed. The record stays in the register's history, and their "
                + "hostel fee stops being billed from the next posting."
                + (Number(row.security_deposit) > 0 && row.deposit_paid && !row.deposit_refunded
                    ? `\n\nThey have a Rs. ${rs(row.security_deposit)} deposit with the school — mark it refunded if you are returning it now.`
                    : ""),
        });
        if (!ok) return;
        let refund = false;
        if (Number(row.security_deposit) > 0 && row.deposit_paid && !row.deposit_refunded) {
            refund = await confirmAction({
                title: "Refund the deposit now?",
                tone: "info",
                confirmText: "Refund now",
                cancelText: "Not now",
                body: `Rs. ${rs(row.security_deposit)}. Choosing no leaves it recorded as still held.`,
            });
        }
        const [status, message] = await checkoutResidents({
            school, allocations: [row.id], deposit_refunded: refund,
        });
        if (status === 200) { updateNotification(200, message || "Checked out!"); loadRegister(); }
        else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    const current = residents.filter((r) => r.status === ALLOC_ACTIVE);
    const totalBilling = current.reduce((a, r) => a + Number(r.monthly_fee || 0), 0);

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            {/* --------------------------------------------- admit students */}
            <ChooseClass
                title="Admit students"
                info="Pick a class to see who can move in. Students who already hold a hostel place are not offered — nobody can be admitted twice."
                selectedClass={selectedClass}
                actions={[selectAction]}
                onSelect={onClassSelect} />

            {candidates.length > 0 && (
                <form onSubmit={onAdmit} className="flex flex-col gap-y-4">
                    <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left sticky top-0">
                                <tr>
                                    <th className="px-3 py-2 w-10">
                                        <input type="checkbox"
                                            checked={picked.length === candidates.length && candidates.length > 0}
                                            onChange={(e) => setPicked(e.target.checked ? candidates.map((c) => c.id) : [])} />
                                    </th>
                                    <th className="px-3 py-2">Student</th><th className="px-3 py-2">Roll</th>
                                    <th className="px-3 py-2">Guardian</th><th className="px-3 py-2">Contact</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candidates.map((c) => (
                                    <tr key={c.id} className={`border-t border-gray-100 ${picked.includes(c.id) ? "bg-teal-50/60" : ""}`}>
                                        <td className="px-3 py-2">
                                            <input type="checkbox" checked={picked.includes(c.id)} onChange={() => togglePick(c.id)} />
                                        </td>
                                        <td className="px-3 py-2 font-semibold capitalize">{c.name}</td>
                                        <td className="px-3 py-2">{c.roll_no || "—"}</td>
                                        <td className="px-3 py-2 capitalize">{c.father_name || "—"}</td>
                                        <td className="px-3 py-2">{c.guardian_contact || c.contact || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <Section title={`Where do these ${picked.length || 0} student(s) go?`}
                        description="Only rooms with space are listed. The monthly fee is the room's rate — lower it here to give a concession, which is all a hostel concession is.">
                        <SearchInput input={{ name: "room", label: "Room", options: roomOptions, required: true }}
                            value={admitForm.room} onChange={({ value }) => onPickRoom(value)} />
                        {picked.length === 1 && (
                            <SelectInput input={{ name: "bed", label: "Bed (optional)", options: [OPTION_ALL, ...freeBeds] }}
                                value={admitForm.bed} onChange={({ value }) => setAdmitForm((s) => ({ ...s, bed: value }))} />
                        )}
                        <TextInput input={{ name: "check_in_date", label: "Check-in date (BS)" }}
                            value={admitForm.check_in_date}
                            onChange={({ value }) => setAdmitForm((s) => ({ ...s, check_in_date: value }))} />
                        <TextInput input={{ name: "monthly_fee", label: "Monthly fee (Rs.)", type: "number" }}
                            value={admitForm.monthly_fee}
                            onChange={({ value }) => setAdmitForm((s) => ({ ...s, monthly_fee: value }))} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="text" type="button" onClick={() => { setCandidates([]); setPicked([]); }}>Cancel</Button>
                        <Button color="teal" type="submit" disabled={busy || picked.length < 1}
                            className="rounded-lg normal-case font-semibold">
                            {busy ? "Admitting…" : `Admit ${picked.length || 0} student(s)`}
                        </Button>
                    </ButtonsSecion>
                </form>
            )}

            {/* ------------------------------------------------- the register */}
            <Section title="Resident register"
                description={`${current.length} student(s) living here · Rs. ${rs(totalBilling)} billed a month.`}
                actions={[
                    <Button key="hist" variant="text" size="sm" onClick={() => setShowHistory((s) => !s)}>
                        {showHistory ? "Current residents only" : "Show past residents too"}
                    </Button>,
                ]}>
                <div className="sm:col-span-12">
                    {residents.length < 1 ? (
                        <p className="text-sm text-gray-500">Nobody has been admitted to this hostel yet.</p>
                    ) : (
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-table-header text-left">
                                    <tr>
                                        <th className="px-3 py-2">Student</th><th className="px-3 py-2">Room</th>
                                        <th className="px-3 py-2">Bed</th><th className="px-3 py-2">Checked in</th>
                                        <th className="px-3 py-2 text-right">Monthly</th>
                                        <th className="px-3 py-2 text-right">Deposit</th>
                                        <th className="px-3 py-2">Status</th>
                                        <th className="px-3 py-2 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {residents.map((r) => (
                                        <tr key={r.id} className={`border-t border-gray-100 ${r.status !== ALLOC_ACTIVE ? "text-gray-400" : ""}`}>
                                            <td className="px-3 py-2 font-semibold capitalize">{r.student_name}</td>
                                            <td className="px-3 py-2">{r.room_no}{r.block_name ? ` (${r.block_name})` : ""}</td>
                                            <td className="px-3 py-2">{r.bed_no || "—"}</td>
                                            <td className="px-3 py-2">{r.check_in_date}</td>
                                            <td className="px-3 py-2 text-right font-bold">Rs. {rs(r.monthly_fee)}</td>
                                            <td className="px-3 py-2 text-right">
                                                {Number(r.security_deposit) > 0
                                                    ? <StatusPill
                                                        text={r.deposit_refunded ? "refunded" : r.deposit_paid ? `Rs. ${rs(r.security_deposit)} held` : "unpaid"}
                                                        tone={r.deposit_refunded ? "gray" : r.deposit_paid ? "blue" : "amber"} />
                                                    : "—"}
                                            </td>
                                            <td className="px-3 py-2">
                                                <StatusPill text={r.status_name} tone={r.status === ALLOC_ACTIVE ? "green" : "gray"} />
                                            </td>
                                            <td className="px-3 py-2">
                                                {r.status === ALLOC_ACTIVE && (
                                                    <div className="flex items-center justify-end gap-x-1">
                                                        <button type="button" title="Edit terms"
                                                            onClick={() => setEditing({
                                                                id: r.id, monthly_fee: r.monthly_fee,
                                                                security_deposit: r.security_deposit,
                                                                deposit_paid: r.deposit_paid,
                                                                emergency_contact_name: r.emergency_contact_name || "",
                                                                emergency_contact: r.emergency_contact || "",
                                                                emergency_contact_relation: r.emergency_contact_relation || "",
                                                                remarks: r.remarks || "",
                                                                _name: r.student_name,
                                                            })}
                                                            className="p-1.5 rounded bg-teal-50 text-teal-700"><PencilSquareIcon className="w-4 h-4" /></button>
                                                        <button type="button" title="Move to another room"
                                                            onClick={() => onOpenMove(r)}
                                                            className="p-1.5 rounded bg-blue-50 text-blue-700"><ArrowRightIcon className="w-4 h-4" /></button>
                                                        <button type="button" title="Check out"
                                                            onClick={() => onCheckout(r)}
                                                            className="p-1.5 rounded bg-rose-50 text-rose-600"><ArrowLeftOnRectangleIcon className="w-4 h-4" /></button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Section>

            {/* ----------------------------------------------- edit the terms */}
            {editing && (
                <form onSubmit={onSaveTerms}>
                    <Section title={`Terms for ${editing._name}`}
                        description="The money and the emergency contact for this stay. To MOVE them to another room use the arrow button — that keeps the history instead of overwriting it.">
                        <TextInput input={{ name: "monthly_fee", label: "Monthly fee (Rs.)", type: "number" }}
                            value={editing.monthly_fee}
                            onChange={({ value }) => setEditing((s) => ({ ...s, monthly_fee: value }))} />
                        <TextInput input={{ name: "security_deposit", label: "Deposit (Rs.)", type: "number" }}
                            value={editing.security_deposit}
                            onChange={({ value }) => setEditing((s) => ({ ...s, security_deposit: value }))} />
                        <SelectInput input={{ name: "deposit_paid", label: "Deposit received", options: [{ value: false, name: "No" }, { value: true, name: "Yes" }] }}
                            value={editing.deposit_paid}
                            onChange={({ value }) => setEditing((s) => ({ ...s, deposit_paid: value === true || value === "true" }))} />
                        <TextInput input={{ name: "emergency_contact_name", label: "Emergency contact name" }}
                            value={editing.emergency_contact_name}
                            onChange={({ value }) => setEditing((s) => ({ ...s, emergency_contact_name: value }))} />
                        <TextInput input={{ name: "emergency_contact", label: "Emergency contact no." }}
                            value={editing.emergency_contact}
                            onChange={({ value }) => setEditing((s) => ({ ...s, emergency_contact: value }))} />
                        <TextInput input={{ name: "emergency_contact_relation", label: "Relation" }}
                            value={editing.emergency_contact_relation}
                            onChange={({ value }) => setEditing((s) => ({ ...s, emergency_contact_relation: value }))} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="text" type="button" onClick={() => setEditing(null)}>Cancel</Button>
                        <Button variant="outlined" type="submit" disabled={busy}>Save terms</Button>
                    </ButtonsSecion>
                </form>
            )}

            {/* --------------------------------------------------- transfer */}
            {moving && (
                <form onSubmit={onTransfer}>
                    <Section title={`Move ${moving.student_name} out of room ${moving.room_no}`}
                        description="Their current stay is closed as Transferred and a new one opens in the new room, so the register can still say where they were last month. The fee carries over unless you change it.">
                        <SearchInput input={{ name: "room", label: "New room", options: roomOptions, required: true }}
                            value={moveForm.room} onChange={({ value }) => onMoveRoom(value)} />
                        <SelectInput input={{ name: "bed", label: "Bed (optional)", options: [OPTION_ALL, ...moveBeds] }}
                            value={moveForm.bed} onChange={({ value }) => setMoveForm((s) => ({ ...s, bed: value }))} />
                        <TextInput input={{ name: "date", label: "Move date (BS)" }} value={moveForm.date}
                            onChange={({ value }) => setMoveForm((s) => ({ ...s, date: value }))} />
                        <TextInput input={{ name: "monthly_fee", label: "New monthly fee (Rs.) — blank keeps the current one", type: "number" }}
                            value={moveForm.monthly_fee}
                            onChange={({ value }) => setMoveForm((s) => ({ ...s, monthly_fee: value }))} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="text" type="button" onClick={() => setMoving(null)}>Cancel</Button>
                        <Button color="blue" type="submit" disabled={busy} className="rounded-lg normal-case font-semibold">
                            {busy ? "Moving…" : "Move student"}
                        </Button>
                    </ButtonsSecion>
                </form>
            )}
        </div>
    );
}

export default HostelResidents;
