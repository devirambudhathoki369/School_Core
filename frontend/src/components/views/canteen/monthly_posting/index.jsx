import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";

import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import { MONTHS, PLAN_MONTHLY } from "@/configs/canteen";
import {
    getClasses, getMonthlyPosting, getPlans, runMonthlyPosting, withdrawMonthlyPosting,
} from "@/services/functions/canteen";
import { SetupNeeded, StatusPill, Tile, rs, sumMoney, useCanteenScope, useOnce } from "../common";

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
 * MONTHLY POSTING — the canteen's ledger posting for regular users.
 *
 * Pick the months (several at once, like the fee ledger posting), the class or
 * every class, and the use types. Each regular user is charged their type's
 * item at their CLASS's rate (Items & Rates > Class rates) — or their own rate
 * — for every month picked, onto their canteen account, item by item. It is
 * collected in Collect & Receipt. A month already posted is never posted twice;
 * a posting withdrawn can be posted again.
 */
function CanteenMonthlyPosting() {
    const { school, today, updateNotification } = useCanteenScope();
    const [plans, setPlans] = useState(null);
    const [classes, setClasses] = useState([]);
    const [chosenPlans, setChosenPlans] = useState({});
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
        getPlans(school).then((list) => {
            const monthly = list.filter((p) => p.kind === PLAN_MONTHLY);
            setPlans(monthly);
            setChosenPlans(Object.fromEntries(monthly.map((p) => [p.id, true])));
        });
        getClasses(school).then(setClasses);
    }, [school]);

    const planIds = useMemo(() => Object.keys(chosenPlans).filter((id) => chosenPlans[id]).map(Number), [chosenPlans]);
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

    async function onPost() {
        if (toPostStudents.length < 1) return updateNotification("", "Nobody is ticked to post.");
        if (!await confirmAction({
            tone: "info", confirmText: "Post",
            title: `Post Rs. ${rs(total)} to ${toPostStudents.length} student(s) for ${monthNames} ${year}?`,
            body: `Each regular user's item is charged at their class rate for ${monthNames}, onto their canteen account, dated ${date}. `
                + "It is collected in Collect & Receipt. A month already posted is never posted again.",
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
        return <SetupNeeded what="monthly use types" where="Add Day care or Tiffin monthly in Canteen > Use Types, set the item's class rates and put students on it." />;
    }

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="What to post" description="The months, the class and the use types. The preview shows each regular user's charge before anything is posted.">
                <TextInput input={{ name: "year", label: "Year (BS)", type: "number" }} value={year} onChange={({ value }) => setYear(value)} />
                <SelectInput input={{ name: "class_key", label: "Class", options: classOptions }} value={classKey}
                    onChange={({ value }) => setClassKey(value)} />
                <TextInput input={{ name: "date", label: "Posting date (BS)", mask: "date" }} value={date} onChange={({ value }) => setDate(value)} />
                <div className="sm:col-span-12 flex flex-col gap-2">
                    <span className="text-xs font-semibold text-gray-600">Months</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Months">
                        {MONTHS.map((m) => (
                            <Chip key={m.value} on={!!months[m.value]} onClick={() => setMonths((s) => ({ ...s, [m.value]: !s[m.value] }))}>{m.name}</Chip>
                        ))}
                    </div>
                    <span className="text-xs font-semibold text-gray-600 mt-1">Use types</span>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Use types">
                        {plans.map((p) => (
                            <Chip key={p.id} on={!!chosenPlans[p.id]} onClick={() => setChosenPlans((s) => ({ ...s, [p.id]: !s[p.id] }))}>
                                {p.name} · {p.item_name} · {p.enrolled}
                            </Chip>
                        ))}
                    </div>
                </div>
            </Section>

            {monthList.length < 1 ? <p className="text-sm text-gray-500">Pick at least one month.</p> : loading || !data ? <Loader /> : (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <Tile label={`To post · ${monthNames} ${year}`} value={`Rs. ${rs(total)}`} tone="blue"
                            hint={`${toPostStudents.length} of ${postable.length} student(s) ticked`} />
                        <Tile label="Already posted" value={rows.filter((r) => r.state === "posted").length} tone="green" hint="for every month picked" />
                        <Tile label="Skipped" value={rows.filter((r) => r.state === "skip").length} tone="amber" hint="no class rate, or not running" />
                    </div>

                    {rows.length < 1 ? (
                        <p className="text-sm text-gray-500">No regular user on these use types in {monthNames} {year}{classKey ? " for this class" : ""}.</p>
                    ) : (
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
                                        <th className="px-3 py-2">Use type · item</th>
                                        <th className="px-3 py-2 text-right">Rate</th>
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
                                            <td className="px-3 py-1.5">{r.plan_name} · {r.item_name}</td>
                                            <td className="px-3 py-1.5 text-right tabular-nums">
                                                {Number(r.rate) > 0 ? rs(r.rate) : "—"}
                                                {r.own_rate && <span className="block text-[10px] text-blue-700">own rate</span>}
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
                    {postable.length > 0 && (
                        <ButtonsSecion>
                            <Button color="teal" className="normal-case" disabled={busy || toPostStudents.length < 1} onClick={onPost}>
                                {busy ? "Posting…" : `Post ${toPostStudents.length} student(s) — Rs. ${rs(total)}`}
                            </Button>
                        </ButtonsSecion>
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
