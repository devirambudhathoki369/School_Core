import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";

import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import { getFacilities, getFacilityUsers, saveFacilityUsers } from "@/services/functions/canteen";
import { SetupNeeded, StatusPill, rs, useCanteenScope, useOnce } from "../common";

/**
 * USER SETUP — who uses a facility.
 *
 * Choose the facility and every student of the classes it is set up for is
 * listed; tick who uses it and save. Taking a tick away stops them from the next
 * posting. Months already posted stay on their canteen account.
 */
function CanteenFacilityUsers() {
    const { school, today, updateNotification } = useCanteenScope();
    const [facilities, setFacilities] = useState(null);
    const [plan, setPlan] = useState("");
    const [students, setStudents] = useState(null);
    const [ticks, setTicks] = useState({});
    const [start, setStart] = useState(today);
    const [classKey, setClassKey] = useState("");
    const [query, setQuery] = useState("");
    const [busy, once] = useOnce();

    useEffect(() => { if (school) getFacilities(school).then(setFacilities); }, [school]);
    useEffect(() => { if (today) setStart(today); }, [today]);

    async function load(id = plan) {
        if (!id) { setStudents(null); return; }
        setStudents(null);
        const data = await getFacilityUsers(school, id);
        const list = Array.isArray(data?.students) ? data.students : [];
        setStudents(list);
        setTicks(Object.fromEntries(list.map((s) => [s.id, {
            on: s.ticked,
            rate: s.own_rate === null || s.own_rate === undefined ? "" : `${Number(s.own_rate)}`,
        }])));
    }
    function choose(id) {
        setPlan(id);
        setClassKey("");
        setQuery("");
        load(id);
    }

    const classes = useMemo(() => {
        const seen = new Map();
        (students || []).forEach((s) => seen.set(s.class_key, s.class_label));
        return [...seen.entries()];
    }, [students]);
    const shown = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return (students || []).filter((s) => (!classKey || s.class_key === classKey)
            && (!needle || s.name.toLowerCase().includes(needle) || `${s.roll_no || ""}`.toLowerCase() === needle));
    }, [students, classKey, query]);

    const changes = useMemo(() => {
        let added = 0, removed = 0, changed = 0;
        (students || []).forEach((s) => {
            const t = ticks[s.id];
            if (!t) return;
            if (t.on && !s.ticked) added += 1;
            else if (!t.on && s.ticked) removed += 1;
            else if (t.on && Number(t.rate || -1) !== Number(s.own_rate ?? -1)) changed += 1;
        });
        return { added, removed, changed };
    }, [students, ticks]);
    const dirty = changes.added + changes.removed + changes.changed > 0;
    const tickedCount = Object.values(ticks).filter((t) => t.on).length;
    const allShownOn = shown.length > 0 && shown.every((s) => ticks[s.id]?.on);

    function tickAll() {
        setTicks((state) => {
            const next = { ...state };
            shown.forEach((s) => { next[s.id] = { ...(next[s.id] || { rate: "" }), on: !allShownOn }; });
            return next;
        });
    }
    async function onSave() {
        if (changes.removed > 0 && !await confirmAction({
            tone: "warning", confirmText: "Save",
            title: `Stop ${changes.removed} student(s) on this facility?`,
            body: "They are not posted from the next month. Months already posted stay on their canteen account.",
        })) return;
        await once(async () => {
            const [status, message] = await saveFacilityUsers({
                school, plan: Number(plan), start_date: start || undefined,
                students: (students || []).filter((s) => ticks[s.id]?.on).map((s) => ({ id: s.id, rate: ticks[s.id].rate })),
            });
            updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Saved." : "Nothing was saved."));
            if (status === 200) load();
        });
    }

    if (facilities === null) return <Loader />;
    if (facilities.length < 1) {
        return <SetupNeeded what="facilities" where="Add one in Canteen > Facility Setup, with its classes and amounts." />;
    }

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Choose the facility" description="Its classes are listed below. Tick the students who use it.">
                <SelectInput input={{
                    name: "plan", label: "Facility",
                    options: [{ value: "", name: "Pick a facility" }, ...facilities.map((f) => ({ value: f.id, name: f.name }))],
                }} value={plan} onChange={({ value }) => choose(value)} />
                {plan && (
                    <TextInput input={{ name: "start", label: "New students from (BS)", mask: "date" }} value={start}
                        onChange={({ value }) => setStart(value)} info="The first month posted for them is this date's month." />
                )}
                {plan && classes.length > 1 && (
                    <SelectInput input={{
                        name: "class_key", label: "Class",
                        options: [{ value: "", name: "Every class" }, ...classes.map(([key, label]) => ({ value: key, name: label }))],
                    }} value={classKey} onChange={({ value }) => setClassKey(value)} />
                )}
                {plan && (
                    <TextInput input={{ name: "find", label: "Find a student", placeholder: "Name or roll no." }} value={query}
                        onChange={({ value }) => setQuery(value)} />
                )}
            </Section>

            {plan && students === null && <Loader />}
            {plan && students && students.length < 1 && (
                <SetupNeeded what="students in this facility's classes" where="Check the classes it is set up for in Facility Setup." />
            )}
            {plan && students && students.length > 0 && (
                <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left">
                                <tr>
                                    <th className="px-3 py-2 w-10">
                                        <input type="checkbox" aria-label="Tick everyone listed" className="accent-teal-600" checked={allShownOn} onChange={tickAll} />
                                    </th>
                                    <th className="px-3 py-2">Student</th>
                                    <th className="px-3 py-2 hidden sm:table-cell">Class</th>
                                    <th className="px-3 py-2 text-right hidden sm:table-cell">Class amount</th>
                                    <th className="px-3 py-2 text-right w-32">Own amount</th>
                                    <th className="px-3 py-2 hidden lg:table-cell">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {shown.map((s) => {
                                    const t = ticks[s.id] || { on: false, rate: "" };
                                    return (
                                        <tr key={s.id} className="border-t border-gray-100">
                                            <td className="px-3 py-1.5">
                                                <input type="checkbox" aria-label={`Tick ${s.name}`} className="accent-teal-600" checked={t.on}
                                                    onChange={() => setTicks((state) => ({ ...state, [s.id]: { ...t, on: !t.on } }))} />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <span className="font-semibold break-words">{s.name}</span>
                                                {s.roll_no && <span className="text-xs text-gray-500"> · Roll {s.roll_no}</span>}
                                                <span className="block text-xs text-gray-500 sm:hidden">{s.detail} · {s.class_amount ? rs(s.class_amount) : "no amount"}</span>
                                            </td>
                                            <td className="px-3 py-1.5 whitespace-nowrap hidden sm:table-cell">{s.detail || "—"}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">{s.class_amount ? rs(s.class_amount) : "—"}</td>
                                            <td className="px-3 py-1.5 text-right">
                                                <input type="number" min="0" step="0.01" disabled={!t.on} aria-label={`Own amount for ${s.name}`}
                                                    placeholder="class" value={t.rate}
                                                    onChange={(e) => setTicks((state) => ({ ...state, [s.id]: { ...t, rate: e.target.value } }))}
                                                    className="w-24 rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-50" />
                                            </td>
                                            <td className="px-3 py-1.5 hidden lg:table-cell">
                                                {s.outside && <StatusPill text="Class not set up" tone="amber" />}
                                                {!s.outside && s.ticked && <StatusPill text={`On it since ${s.since}`} tone="green" />}
                                                {s.months_posted > 0 && <span className="ml-1 text-xs text-gray-500">{s.months_posted} month(s) posted</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {shown.length < 1 && <tr><td colSpan={6} className="px-3 py-3 text-gray-500">Nobody matches that search.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                    <ButtonsSecion>
                        <Button color="teal" className="normal-case" disabled={busy || !dirty} onClick={onSave}>
                            {busy ? "Saving…" : dirty
                                ? `Save: ${[changes.added && `${changes.added} new`, changes.removed && `${changes.removed} stopped`, changes.changed && `${changes.changed} own amount`].filter(Boolean).join(", ")}`
                                : `${tickedCount} student(s) ticked`}
                        </Button>
                    </ButtonsSecion>
                </>
            )}
        </div>
    );
}

export default CanteenFacilityUsers;
