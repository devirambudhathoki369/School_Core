import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PlusIcon, SparklesIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { customAction, deleteAction, editAction } from "@/components/tables/actions";
import { PLAN_MONTHLY } from "@/configs/canteen";
import {
    addStandardPlans, deletePlan, enrollStudents, getClasses, getEnrollmentCandidates, getEnrollments, getItems,
    getPlans, saveEnrollment, stopEnrollment,
} from "@/services/functions/canteen";
import { SetupNeeded, StatusPill, Tile, rs, sumMoney, useCanteenScope, useOnce } from "../common";
import PlanFormDialog from "./PlanFormDialog";

const studentsAction = customAction({ text: "Students", action: "students", tooltip: "Who is on it" });
const PLAN_ACTIONS = [studentsAction, editAction, deleteAction];

function PlanCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block break-words text-blue-gray-900 !font-semibold">{item?.name}</span>
            <span className="block text-meta text-[var(--ink-500,#64748b)]">{item?.kind_name}</span>
        </div>
    );
}
function Terms({ item }) {
    const monthly = item?.kind === PLAN_MONTHLY;
    return (
        <span className="app-cell-text block px-2 whitespace-nowrap tabular-nums text-blue-gray-900">
            {monthly ? "Class rate, every month"
                : (Number(item?.due_limit) > 0 ? `Due up to Rs. ${rs(item.due_limit)}` : "Cash only")}
        </span>
    );
}
function ItemName({ item }) {
    return <span className="app-cell-text block px-2">{item?.kind === PLAN_MONTHLY ? (item?.item_name || "—") : "Any counter item"}</span>;
}

const PLAN_COLUMNS = [
    ["name", "use type", null, false, null, PlanCell],
    ["item_name", "item", null, false, null, ItemName],
    ["due_limit", "charged", null, false, null, Terms],
    ["enrolled", "students"],
];

/**
 * USE TYPES — how students use the canteen, and who is on each.
 *
 *   Monthly (day care, tiffin monthly): its item is posted every month at the
 *   student's class rate, onto their canteen account, from Monthly Posting
 *   every month from Canteen > Monthly Billing; the counter serves their meals
 *   without charging when the type includes counter meals.
 *   Cash or due (tiffin cash or due): paid when taken — cash, or due on the
 *   student's canteen account up to the type's limit.
 *
 * A student pays their class's rate unless given their own (a concession on
 * that one student). Everything here is the canteen's own billing.
 */
function CanteenUseTypes() {
    const { school, today, updateNotification } = useCanteenScope();
    const [plans, setPlans] = useState(null);
    const [dialog, setDialog] = useState({ open: false, plan: null });
    const [current, setCurrent] = useState(null);
    const [enrolled, setEnrolled] = useState(null);
    // The class as the canteen keys its rates and posting (`/canteen/classes`):
    // the grade with every section and stream of it. Read from the canteen's
    // own endpoint so a canteen user — whose sign-in opens nothing else — can
    // put students on a type as well as the office can.
    const [classes, setClasses] = useState([]);
    const [selectedClass, setSelectedClass] = useState("");
    const [section, setSection] = useState("");
    const [candidates, setCandidates] = useState([]);
    const [picked, setPicked] = useState({});
    const [rate, setRate] = useState("");
    const [start, setStart] = useState(today);
    const [editing, setEditing] = useState(null);
    const [items, setItems] = useState([]);
    const [busy, once] = useOnce();
    const panelRef = useRef(null);

    async function load() {
        if (!school) return;
        getClasses(school).then(setClasses);
        setItems(await getItems(school));
        const list = await getPlans(school);
        setPlans(list);
        return list;
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);
    useEffect(() => { if (today) setStart(today); }, [today]);

    async function loadEnrolled(plan = current) {
        if (!plan) return;
        const data = await getEnrollments(school, plan.id);
        setEnrolled(Array.isArray(data?.rows) ? data.rows : []);
    }
    async function openPlan(plan) {
        setCurrent(plan);
        setEnrolled(null);
        setSelectedClass("");
        setSection("");
        setCandidates([]);
        setPicked({});
        setRate("");
        await loadEnrolled(plan);
        setTimeout(() => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    }

    async function onStandard() {
        await once(async () => {
            const [status, message] = await addStandardPlans(school);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        });
    }
    async function onPlanAction(action, id, item) {
        if (action === "students") openPlan(item);
        else if (action === "edit") setDialog({ open: true, plan: item });
        else if (action === "delete") {
            if (!await confirmAction({
                title: `Remove the use type ${item.name}?`, confirmText: "Remove",
                body: "Only a type nobody is on can be removed. Months already posted stay on the canteen accounts.",
            })) return;
            const [status, message] = await deletePlan(school, item.id);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) { if (current?.id === item.id) setCurrent(null); load(); }
        }
    }

    async function onClassSelect(key) {
        setSelectedClass(key);
        setSection("");
        setPicked({});
        setCandidates(key ? await getEnrollmentCandidates(school, current.id, key) : []);
    }
    // A grade's sections and streams, to narrow the list to one of them.
    const sections = useMemo(() => [...new Set(candidates.map((c) => c.detail).filter(Boolean))].sort(), [candidates]);
    const shown = section ? candidates.filter((c) => c.detail === section) : candidates;
    const pickable = shown.filter((c) => !c.enrolled);
    const pickedIds = pickable.filter((c) => picked[c.id]).map((c) => c.id);
    const allPicked = pickable.length > 0 && pickedIds.length === pickable.length;

    async function onEnroll() {
        if (pickedIds.length < 1) return updateNotification("", "Tick the students to put on it.");
        await once(async () => {
            const [status, message] = await enrollStudents({
                school, plan: current.id, students: pickedIds, start_date: start || undefined,
                rate: current.kind === PLAN_MONTHLY ? (rate === "" ? undefined : rate) : undefined,
            });
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) {
                setPicked({});
                setCandidates(await getEnrollmentCandidates(school, current.id, selectedClass));
                loadEnrolled();
                const list = await load();
                setCurrent((c) => (list || []).find((p) => p.id === c?.id) || c);
            }
        });
    }
    async function onSaveRate(row) {
        await once(async () => {
            // blank = back to the class rate
            const [status, message] = await saveEnrollment({ school, id: row.id, rate: editing.rate });
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) { setEditing(null); loadEnrolled(); }
        });
    }
    async function onStop(row) {
        const never = !row.months_billed;
        if (!await confirmAction({
            tone: "warning", confirmText: never ? "Take off" : "Stop",
            title: `${never ? "Take" : "Stop"} ${row.name} ${never ? "off" : "on"} ${current.name}?`,
            body: never
                ? "Nothing has been billed for it, so it is simply taken off."
                : `Stopped from ${today}. Months already posted stay on the canteen account; no month after this is posted.`,
        })) return;
        const [status, message] = await stopEnrollment(school, row.id, today);
        updateNotification(status === 200 ? 200 : 400, message || "Failed.");
        if (status === 200) { loadEnrolled(); load(); }
    }

    const monthlyPlans = useMemo(() => (plans || []).filter((p) => p.kind === PLAN_MONTHLY), [plans]);
    const hasStandard = (plans || []).length >= 3;

    if (plans === null) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Tile label="Use types" value={plans.length} tone="blue" />
                <Tile label="Students on monthly types" value={monthlyPlans.reduce((s, p) => s + (p.enrolled || 0), 0)} tone="green" />
                <Tile label="Students on cash or due" value={plans.filter((p) => p.kind !== PLAN_MONTHLY).reduce((s, p) => s + (p.enrolled || 0), 0)} tone="gray" />
            </div>

            {plans.length < 1 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
                    <p className="text-sm font-semibold text-gray-700">No use types yet.</p>
                    <p className="mt-1 text-xs text-gray-500">Start with the usual three — Day care and Tiffin monthly (posted every month) and Tiffin cash or due — then set Day care's and Tiffin's class rates in Items &amp; Rates.</p>
                    <div className="mt-3 flex flex-wrap justify-center gap-2">
                        <Button color="teal" className="normal-case flex items-center gap-1" disabled={busy} onClick={onStandard}>
                            <SparklesIcon className="h-4 w-4" /> Add the usual three
                        </Button>
                        <Button variant="outlined" className="normal-case" onClick={() => setDialog({ open: true, plan: null })}>Add my own</Button>
                    </div>
                </div>
            ) : (
                <BasicTable name="Canteen use types" columns={PLAN_COLUMNS} data={plans} showSelected={false} dense
                    rowView={false} mobileColumns={["name", "item_name"]} actions={PLAN_ACTIONS} onSelect={onPlanAction}
                    topActions={
                        <span className="flex flex-wrap gap-2">
                            {!hasStandard && (
                                <Button variant="outlined" className="py-2 px-3 normal-case" disabled={busy} onClick={onStandard}>Add the usual three</Button>
                            )}
                            <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setDialog({ open: true, plan: null })}>
                                <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add use type
                            </Button>
                        </span>
                    } />
            )}

            {current && (
                <div ref={panelRef} className="scroll-mt-3 flex flex-col gap-y-4">
                    <Section title={`Students on ${current.name}`}
                        description={current.kind === PLAN_MONTHLY
                            ? `Posted "${current.item_name}" every month at each student's class rate (or their own rate below), onto their canteen account, from Monthly Posting.`
                            : (Number(current.due_limit) > 0
                                ? `Paid when taken: cash, or due on their canteen account up to Rs. ${rs(current.due_limit)}.`
                                : "Paid when taken, cash only (set a due limit on the type to allow due).")}>
                        <div className="sm:col-span-12">
                            {enrolled === null ? <Loader /> : enrolled.length < 1 ? (
                                <p className="text-sm text-gray-500">Nobody is on it yet. Pick a class below to put students on it.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-table-header text-left">
                                            <tr>
                                                <th className="px-3 py-2">Student</th>
                                                <th className="px-3 py-2">Class</th>
                                                {current.kind === PLAN_MONTHLY && <th className="px-3 py-2 text-right">Rate / month</th>}
                                                <th className="px-3 py-2">Since</th>
                                                {current.kind === PLAN_MONTHLY && <th className="px-3 py-2 text-right">Months billed</th>}
                                                <th className="px-3 py-2 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {enrolled.map((row) => (
                                                <tr key={row.id} className="border-t border-gray-100">
                                                    <td className="px-3 py-1.5">
                                                        <span className="font-semibold">{row.name}</span>
                                                        {row.roll_no && <span className="text-xs text-gray-500"> · Roll {row.roll_no}</span>}
                                                        {!row.running && <> <StatusPill text="Not running" tone="amber" /></>}
                                                    </td>
                                                    <td className="px-3 py-1.5">{row.detail}</td>
                                                    {current.kind === PLAN_MONTHLY && (
                                                        <td className="px-3 py-1.5 text-right tabular-nums">
                                                            {editing?.id === row.id ? (
                                                                <input type="number" min="0" step="0.01" autoFocus value={editing.rate} placeholder="class rate"
                                                                    aria-label={`Rate for ${row.name}`}
                                                                    onChange={(e) => setEditing({ id: row.id, rate: e.target.value })}
                                                                    onKeyDown={(e) => { if (e.key === "Enter") onSaveRate(row); if (e.key === "Escape") setEditing(null); }}
                                                                    className="w-28 rounded border border-gray-300 px-2 py-1 text-right" />
                                                            ) : row.rate === null || row.rate === undefined
                                                                ? <StatusPill text="No class rate" tone="amber" />
                                                                : <>{rs(row.rate)}{row.own_rate !== null && row.own_rate !== undefined
                                                                    ? <span className="block text-[10px] text-blue-700">own rate</span>
                                                                    : <span className="block text-[10px] text-gray-500">{row.class_label} rate</span>}</>}
                                                        </td>
                                                    )}
                                                    <td className="px-3 py-1.5 whitespace-nowrap">{row.start_date}</td>
                                                    {current.kind === PLAN_MONTHLY && <td className="px-3 py-1.5 text-right">{row.months_billed}</td>}
                                                    <td className="px-3 py-1.5">
                                                        <div className="flex justify-end gap-1">
                                                            {current.kind === PLAN_MONTHLY && (editing?.id === row.id ? (
                                                                <>
                                                                    <Button size="sm" variant="text" className="normal-case" onClick={() => setEditing(null)}>Cancel</Button>
                                                                    <Button size="sm" color="teal" className="normal-case" disabled={busy} onClick={() => onSaveRate(row)}>Save</Button>
                                                                </>
                                                            ) : (
                                                                <Button size="sm" variant="text" className="normal-case"
                                                                    onClick={() => setEditing({ id: row.id, rate: row.own_rate !== null && row.own_rate !== undefined ? `${Number(row.own_rate)}` : "" })}>Own rate</Button>
                                                            ))}
                                                            <Button size="sm" variant="text" color="red" className="normal-case" onClick={() => onStop(row)}>
                                                                {row.months_billed ? "Stop" : "Take off"}
                                                            </Button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                        {current.kind === PLAN_MONTHLY && (
                                            <tfoot>
                                                <tr className="border-t-2 border-gray-300 bg-gray-50">
                                                    <td className="px-3 py-2 font-bold" colSpan={2}>{enrolled.length} student(s)</td>
                                                    <td className="px-3 py-2 font-bold text-right tabular-nums">{rs(sumMoney(enrolled.map((r) => r.rate || 0)))}</td>
                                                    <td colSpan={3} className="px-3 py-2 text-xs text-gray-500">a month, all together</td>
                                                </tr>
                                            </tfoot>
                                        )}
                                    </table>
                                </div>
                            )}
                        </div>
                    </Section>

                    <Section title={`Put students on ${current.name}`}
                        description="Pick a class, tick the students, and put them on it. Students already on it are marked.">
                        <SelectInput input={{
                            name: "class_key", label: "Class",
                            options: [{ value: "", name: "Pick a class" }, ...classes.map((c) => ({ value: c.key, name: `${c.label} (${c.students})` }))],
                        }} value={selectedClass} onChange={({ value }) => onClassSelect(value)} />
                        {sections.length > 1 && (
                            <SelectInput input={{
                                name: "section", label: "Section",
                                options: [{ value: "", name: "Every section" }, ...sections.map((name) => ({ value: name, name }))],
                            }} value={section} onChange={({ value }) => { setSection(value); setPicked({}); }} />
                        )}
                    </Section>

                    {selectedClass && (
                        <>

                            <Section title={null} description={null}>
                                {current.kind === PLAN_MONTHLY && (
                                    <TextInput input={{ name: "rate", label: "Own rate a month (Rs.)", type: "number", placeholder: "blank = class rate" }} value={rate}
                                        onChange={({ value }) => setRate(value)} info="Leave blank to charge each student their class's rate. A figure here is a concession for the students ticked now." />
                                )}
                                <TextInput input={{ name: "start", label: "From (BS)", mask: "date" }} value={start}
                                    onChange={({ value }) => setStart(value)} info={current.kind === PLAN_MONTHLY ? "The first month billed is this date's month." : null} />
                            </Section>
                            {shown.length < 1 ? <SetupNeeded what="running students in this class" where="Pick another class." /> : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                    <table className="w-full text-sm">
                                        <thead className="bg-table-header text-left">
                                            <tr>
                                                <th className="px-3 py-2 w-10">
                                                    <input type="checkbox" aria-label="Tick everyone" checked={allPicked} className="accent-teal-600"
                                                        onChange={() => setPicked(allPicked ? {} : Object.fromEntries(pickable.map((c) => [c.id, true])))} />
                                                </th>
                                                <th className="px-3 py-2">Student</th>
                                                <th className="px-3 py-2">Class</th>
                                                <th className="px-3 py-2">Roll</th>
                                                <th className="px-3 py-2"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shown.map((c) => (
                                                <tr key={c.id} className={`border-t border-gray-100 ${c.enrolled ? "opacity-60" : ""}`}>
                                                    <td className="px-3 py-1.5">
                                                        <input type="checkbox" aria-label={`Tick ${c.name}`} disabled={c.enrolled} className="accent-teal-600"
                                                            checked={!!picked[c.id] || c.enrolled}
                                                            onChange={() => setPicked((s) => ({ ...s, [c.id]: !s[c.id] }))} />
                                                    </td>
                                                    <td className="px-3 py-1.5 font-semibold">{c.name}</td>
                                                    <td className="px-3 py-1.5 whitespace-nowrap">{c.detail || "—"}</td>
                                                    <td className="px-3 py-1.5">{c.roll_no || "—"}</td>
                                                    <td className="px-3 py-1.5">{c.enrolled && <StatusPill text="Already on it" tone="green" />}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            <ButtonsSecion>
                                <Button color="teal" className="normal-case" disabled={busy || pickedIds.length < 1} onClick={onEnroll}>
                                    {busy ? "Saving…" : `Put ${pickedIds.length} student(s) on ${current.name}`}
                                </Button>
                            </ButtonsSecion>
                        </>
                    )}
                </div>
            )}

            <PlanFormDialog open={dialog.open} plan={dialog.plan} school={school} items={items}
                onClose={() => setDialog((s) => ({ ...s, open: false }))}
                onSaved={async (message) => {
                    setDialog((s) => ({ ...s, open: false }));
                    updateNotification(200, message || "Saved!");
                    const list = await load();
                    if (current) setCurrent((list || []).find((p) => p.id === current.id) || null);
                }} />
        </div>
    );
}

export default CanteenUseTypes;
