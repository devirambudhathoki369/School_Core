import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";

import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import { MONTHS } from "@/configs/canteen";
import {
    getClasses, getFacilities, getMonthlyPosting, runMonthlyPosting, withdrawMonthlyPosting,
} from "@/services/functions/canteen";
import { Note, SetupNeeded, StatusPill, Tile, rs, sumMoney, useCanteenScope, useOnce } from "../common";

const STATE = {
    post: { text: "To post", tone: "blue" },
    posted: { text: "Posted", tone: "green" },
    skip: { text: "Skipped", tone: "amber" },
};

function Chip({ on, onClick, children }) {
    return (
        <button type="button" aria-pressed={on} onClick={onClick}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${on
                ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-solid,#0f766e)] text-white"
                : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
            {children}
        </button>
    );
}

/**
 * MONTHLY POSTING — the canteen's ledger posting.
 *
 * Pick the month (several at once, like the fee ledger posting) and the class.
 * Every student ticked in User Setup is charged their facility at their class's
 * amount (Facility Setup), or their own amount, for each month, onto their canteen
 * account. It shows in their Student Profile and is paid at Canteen > Payment. A
 * month already posted is never posted twice; a posting withdrawn can be posted
 * again.
 */
function CanteenMonthlyPosting() {
    const { school, today, updateNotification } = useCanteenScope();
    const [plans, setPlans] = useState(null);
    const [classes, setClasses] = useState([]);
    const [planId, setPlanId] = useState("");
    const [months, setMonths] = useState({});
    const [year, setYear] = useState("");
    const [classKey, setClassKey] = useState("");
    const [date, setDate] = useState(today);
    const [data, setData] = useState(null);
    const [skipStudents, setSkipStudents] = useState({});
    const [loading, setLoading] = useState(false);
    const [busy, once] = useOnce();

    useEffect(() => {
        if (!today) return;
        setYear(today.slice(0, 4));
        setMonths({ [Number(today.slice(5, 7)) || 1]: true });
        setDate(today);
    }, [today]);
    useEffect(() => {
        if (!school) return;
        getFacilities(school).then(setPlans);
        getClasses(school).then(setClasses);
    }, [school]);

    const planIds = useMemo(() => (planId ? [Number(planId)] : []), [planId]);
    const monthList = useMemo(() => Object.keys(months).filter((m) => months[m]).map(Number).sort((a, b) => a - b), [months]);

    async function preview() {
        if (!school || !year || monthList.length < 1) { setData(null); return; }
        setLoading(true);
        const res = await getMonthlyPosting(school, {
            bs_year: year, months: monthList.join(","), plans: planIds.join(",") || undefined, class_key: classKey || undefined,
        });
        setData(res && Array.isArray(res.rows) ? res : { rows: [], posted: [] });
        setSkipStudents({});
        setLoading(false);
    }
    useEffect(() => { if (plans && year) preview(); /* eslint-disable-next-line */ }, [plans, year, monthList.join(","), planIds.join(","), classKey]);

    const rows = useMemo(() => data?.rows || [], [data]);
    const toPost = rows.filter((r) => r.state === "post" && !skipStudents[r.student]);
    const toPostStudents = [...new Set(toPost.map((r) => r.student))];
    const postable = [...new Set(rows.filter((r) => r.state === "post").map((r) => r.student))];
    const total = sumMoney(toPost.map((r) => r.amount));
    const monthNames = monthList.map((m) => MONTHS[m - 1]?.name).join(", ");
    const classOptions = [{ value: "", name: "Every class" }, ...classes.map((c) => ({ value: c.key, name: c.label }))];
    const skipped = rows.filter((r) => r.state === "skip");
    // Why Post cannot run right now, in words. The button is on screen either way:
    // hidden, it read as a page with no way to post at all.
    let postBlockedBy = "";
    if (monthList.length < 1) postBlockedBy = "Pick at least one month.";
    else if (loading || !data) postBlockedBy = "Checking who is to be posted…";
    else if (rows.length < 1) {
        postBlockedBy = `No student is ticked for ${monthNames} ${year}${classKey ? " in this class" : ""}. `
            + "Tick them in Canteen > User Setup. A student is posted from the month their ticking starts.";
    } else if (postable.length < 1) {
        postBlockedBy = skipped.length > 0
            ? `${skipped.length} student(s) cannot be posted: ${skipped[0].why}. Set the class and its amount in Canteen > Facility Setup.`
            : `Everyone here is already posted for ${monthNames} ${year}.`;
    } else if (toPostStudents.length < 1) postBlockedBy = "Tick at least one student in the list below.";

    async function onPost() {
        if (toPostStudents.length < 1) return updateNotification("", "Nobody is ticked to post.");
        if (!await confirmAction({
            tone: "info", confirmText: "Post",
            title: `Post Rs. ${rs(total)} to ${toPostStudents.length} student(s) for ${monthNames} ${year}?`,
            body: `Each student is charged at their class's amount for ${monthNames}, onto their canteen account, dated ${date}. `
                + "It shows in their Student Profile and is paid at Canteen > Payment. A month already posted is never posted again.",
        })) return;
        await once(async () => {
            const [status, message, res] = await runMonthlyPosting({
                school, bs_year: Number(year), months: monthList, plans: planIds, class_key: classKey || undefined,
                students: toPostStudents, date: date || undefined,
            });
            updateNotification(status === 200 && !(res?.skipped?.length) ? 200 : status === 200 ? "" : 400,
                message || (status === 200 ? "Posted." : "Nothing was posted."));
            preview();
        });
    }
    async function onWithdraw(p) {
        if (!await confirmAction({
            tone: "warning", confirmText: "Withdraw",
            title: `Withdraw ${p.name}'s posting (Rs. ${rs(p.amount)})?`,
            body: "It is taken off their canteen account (kept as withdrawn) and those months can be posted again. "
                + "If a receipt has already paid it, void that receipt first.",
        })) return;
        await once(async () => {
            const [status, message] = await withdrawMonthlyPosting(school, p.txn);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) preview();
        });
    }

    if (plans === null) return <Loader />;
    if (plans.length < 1) {
        return <SetupNeeded what="facilities" where="Add one in Canteen > Facility Setup, then tick its students in User Setup." />;
    }

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="What to post" description="Choose the month and the class. The list below shows each student's charge before anything is posted.">
                <TextInput input={{ name: "year", label: "Year (BS)", type: "number" }} value={year} onChange={({ value }) => setYear(value)} />
                <SelectInput input={{ name: "class_key", label: "Class", options: classOptions }} value={classKey}
                    onChange={({ value }) => setClassKey(value)} />
                <SelectInput input={{
                    name: "plan", label: "Facility",
                    options: [{ value: "", name: "Every facility" }, ...plans.map((p) => ({ value: p.id, name: p.name }))],
                }} value={planId} onChange={({ value }) => setPlanId(value)} />
                <TextInput input={{ name: "date", label: "Posting date (BS)", mask: "date" }} value={date} onChange={({ value }) => setDate(value)} />
                <div className="sm:col-span-12 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-gray-600">Months</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Months">
                        {MONTHS.map((m) => (
                            <Chip key={m.value} on={!!months[m.value]} onClick={() => setMonths((s) => ({ ...s, [m.value]: !s[m.value] }))}>{m.name}</Chip>
                        ))}
                    </div>
                </div>
            </Section>
            <ButtonsSecion>
                <Button color="teal" className="normal-case" disabled={busy || !!postBlockedBy} onClick={onPost}>
                    {busy ? "Posting…" : toPostStudents.length > 0 ? `Post ${toPostStudents.length} student(s) — Rs. ${rs(total)}` : "Post"}
                </Button>
            </ButtonsSecion>
            {postBlockedBy && !loading && data && <Note tone="amber">{postBlockedBy}</Note>}
            {monthList.length < 1 && <Note tone="amber">{postBlockedBy}</Note>}

            {monthList.length < 1 ? null : loading || !data ? <Loader /> : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <Tile label={`To post · ${monthNames} ${year}`} value={`Rs. ${rs(total)}`} tone="blue"
                            hint={`${toPostStudents.length} of ${postable.length} student(s) ticked`} />
                        <Tile label="Already posted" value={rows.filter((r) => r.state === "posted").length} tone="green" hint="for every month picked" />
                        <Tile label="Skipped" value={rows.filter((r) => r.state === "skip").length} tone="amber" hint="no class amount, or not running" />
                    </div>

                    {rows.length > 0 && (
                        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                            <table className="w-full text-sm">
                                <thead className="bg-table-header text-left">
                                    <tr>
                                        <th className="px-3 py-2 w-10">
                                            <input type="checkbox" aria-label="Tick everyone to post" className="accent-teal-600"
                                                checked={postable.length > 0 && toPostStudents.length === postable.length}
                                                onChange={() => setSkipStudents(toPostStudents.length === postable.length
                                                    ? Object.fromEntries(postable.map((id) => [id, true])) : {})} />
                                        </th>
                                        <th className="px-3 py-2">Student</th>
                                        <th className="px-3 py-2">Class</th>
                                        <th className="px-3 py-2">Facility</th>
                                        <th className="px-3 py-2 text-right">Amount a month</th>
                                        <th className="px-3 py-2">Months</th>
                                        <th className="px-3 py-2 text-right">Amount</th>
                                        <th className="px-3 py-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <tr key={r.enrollment} className="border-t border-gray-100">
                                            <td className="px-3 py-1.5">
                                                {r.state === "post" && (
                                                    <input type="checkbox" aria-label={`Post ${r.name}`} className="accent-teal-600"
                                                        checked={!skipStudents[r.student]}
                                                        onChange={() => setSkipStudents((s) => ({ ...s, [r.student]: !s[r.student] }))} />
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <span className="font-semibold">{r.name}</span>
                                                {r.roll_no && <span className="text-xs text-gray-500"> · Roll {r.roll_no}</span>}
                                            </td>
                                            <td className="px-3 py-1.5">{r.detail}</td>
                                            <td className="px-3 py-1.5">{r.plan_name}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                                {Number(r.rate) > 0 ? rs(r.rate) : "—"}
                                                {r.own_rate && <span className="block text-[10px] text-blue-700">own amount</span>}
                                            </td>
                                            <td className="px-3 py-1.5 text-xs">
                                                {r.months_todo.map((m) => MONTHS[m - 1]?.name).join(", ")}
                                                {r.months_posted.length > 0 && (
                                                    <span className="block text-gray-500">posted: {r.months_posted.map((m) => MONTHS[m - 1]?.name).join(", ")}</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{Number(r.amount) > 0 ? rs(r.amount) : "—"}</td>
                                            <td className="px-3 py-1.5">
                                                <StatusPill text={STATE[r.state]?.text} tone={STATE[r.state]?.tone} />
                                                {r.why && <span className="ml-1 text-xs text-gray-500">{r.why}</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {(data.posted || []).length > 0 && (
                        <Section title={`Posted for ${monthNames} ${year}`} description="Each student's posting. Withdraw one posted by mistake.">
                            <div className="sm:col-span-12 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left">
                                        <tr>
                                            <th className="px-3 py-2">Student</th>
                                            <th className="px-3 py-2">Class</th>
                                            <th className="px-3 py-2">Months</th>
                                            <th className="px-3 py-2">Items</th>
                                            <th className="px-3 py-2 text-right">Amount</th>
                                            <th className="px-3 py-2">Posted</th>
                                            <th className="px-3 py-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.posted.map((p) => (
                                            <tr key={p.txn} className="border-t border-gray-100">
                                                <td className="px-3 py-1.5 font-semibold">{p.name}</td>
                                                <td className="px-3 py-1.5">{p.detail}</td>
                                                <td className="px-3 py-1.5">{(p.months || []).join(", ")}</td>
                                                <td className="px-3 py-1.5 text-xs">{p.items}</td>
                                                <td className="px-3 py-1.5 text-right tabular-nums">{rs(p.amount)}</td>
                                                <td className="px-3 py-1.5 text-xs">{p.date} · {p.entered_by}</td>
                                                <td className="px-3 py-1.5 text-right">
                                                    <Button size="sm" variant="text" color="red" className="normal-case" disabled={busy}
                                                        onClick={() => onWithdraw(p)}>Withdraw</Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}
                </>
            )}
        </div>
    );
}

export default CanteenMonthlyPosting;
