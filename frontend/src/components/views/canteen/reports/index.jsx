import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { BellAlertIcon, PrinterIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import { confirmAction } from "@/components/ConfirmDialog";

import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { TXN_REFUND } from "@/configs/canteen";
import { getCanteenReport, getClasses, sendDuesReminder } from "@/services/functions/canteen";
import { StatusPill, Tile, rs, useCanteenScope, useOnce } from "../common";
import CanteenBills from "./CanteenBills";

const REPORTS = [
    { key: "sales", label: "Sales" },
    { key: "items", label: "Item-wise" },
    { key: "cashier", label: "Cashier closing" },
    { key: "receipts", label: "Top-ups & refunds" },
    { key: "dues", label: "Dues" },
    { key: "postings", label: "Monthly postings" },
    { key: "meals", label: "Meal count" },
];

function Money({ data }) {
    return <span className="app-cell-text block px-2 whitespace-nowrap tabular-nums">{rs(data)}</span>;
}
function State({ data }) {
    return <span className="block px-2">{data ? <StatusPill text="Valid" tone="green" /> : <StatusPill text="Voided" tone="red" />}</span>;
}

const COLUMNS = {
    sales: [
        ["sale_no", "no."], ["date", "date"], ["time", "time"], ["name", "buyer"], ["detail", "class / role"],
        ["payment_name", "paid by"], ["qty", "items"], ["total", "total", null, false, null, Money],
        ["entered_by", "served by"], ["is_active", "status", null, false, null, State], ["void_reason", "void reason"],
    ],
    items: [
        ["name", "item"], ["qty", "quantity"], ["plan_qty", "of which on a plan"], ["sales", "sales"],
        ["amount", "amount", null, false, null, Money],
    ],
    cashier: [
        ["entered_by", "person"], ["sales", "sales"], ["plan_meals", "plan meals"],
        ["cash_sales", "cash sales", null, false, null, Money],
        ["account_sales", "account sales", null, false, null, Money],
        ["cash_topups", "cash top-ups", null, false, null, Money],
        ["other_topups", "bank / other top-ups", null, false, null, Money],
        ["cash_refunds", "cash refunds", null, false, null, Money],
        ["cash_in_hand", "cash to hand over", null, true, null, Money],
    ],
    receipts: [
        ["receipt_label", "receipt"], ["date", "date"], ["time", "time"], ["kind_name", "what"], ["name", "account of"],
        ["detail", "class / role"], ["mode_name", "mode"], ["shown_amount", "amount", null, false, null, Money],
        ["entered_by", "by"], ["is_active", "status", null, false, null, State], ["remarks", "remarks"],
    ],
    postings: [
        ["date", "posted on"], ["months", "months"], ["name", "student"], ["detail", "class"], ["roll_no", "roll"],
        ["items", "items"], ["amount", "amount", null, false, null, Money], ["entered_by", "by"],
        ["is_active", "status", null, false, null, State],
    ],
    meals: [
        ["class_label", "class"], ["plans", "on monthly use types"], ["on_plan", "on a plan"],
        ["served", "served on plan"], ["not_yet", "not yet served"], ["bought", "monthly items bought (cash / due)"],
    ],
    dues: [
        ["name", "student"], ["detail", "class"], ["roll_no", "roll"], ["items", "due, item by item"],
        ["charged", "charged", null, false, null, Money], ["paid", "paid", null, false, null, Money],
        ["advance", "advance", null, false, null, Money], ["due", "due", null, true, null, Money],
    ],
};

function numbersOf(type, rows) {
    return (rows || []).map((r) => {
        if (type === "sales") return { ...r, total: Number(r.total || 0) };
        if (type === "items") return { ...r, amount: Number(r.amount || 0) };
        if (type === "cashier") {
            return Object.fromEntries(Object.entries(r).map(([k, v]) => [k, k === "entered_by" ? v : Number(v || 0)]));
        }
        if (type === "postings") return { ...r, amount: Number(r.amount || 0) };
        if (type === "dues") {
            return { ...r, charged: Number(r.charged || 0), paid: Number(r.paid || 0), advance: Number(r.advance || 0), due: Number(r.due || 0) };
        }
        return {
            ...r, receipt_label: `C-${r.receipt_no}`,
            shown_amount: Math.abs(Number(r.amount || 0)) * (r.kind === TXN_REFUND ? -1 : 1),
        };
    });
}

/**
 * THE CANTEEN'S RECORDS.
 *
 * Today's figures on top (what the counter took, what the office took in, what
 * is held on cards and what is owed), and four registers over any date range.
 * "Cash to hand over" in the cashier closing is cash sales + cash top-ups −
 * cash refunds, per person: what each of them should be holding at day's end.
 */
function CanteenReports() {
    const { school, today, updateNotification } = useCanteenScope();
    const [summary, setSummary] = useState(null);
    const [type, setType] = useState("sales");
    const [range, setRange] = useState({ from: today, to: today });
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [classes, setClasses] = useState([]);
    const [classKey, setClassKey] = useState("");
    const [busy, once] = useOnce();
    const billsRef = useRef(null);
    const printBills = useReactToPrint({ content: () => billsRef.current, pageStyle: "@page { size: A4; margin: 8mm; }" });

    async function onRemind() {
        const owing = (report?.rows || []).filter((r) => Number(r.due) > 0);
        const label = classKey ? classes.find((c) => c.key === classKey)?.label : "every class";
        if (!await confirmAction({
            tone: "info", confirmText: "Send reminder",
            title: `Remind ${report?.with_app || 0} famil${report?.with_app === 1 ? "y" : "ies"} (${label}) about canteen dues?`,
            body: `Each family on the app gets their own amount, item by item. ${owing.length - (report?.with_app || 0)} without the app are not reached — print their bills. `
                + "A family is reminded at most once a day.",
        })) return;
        await once(async () => {
            const [status, message] = await sendDuesReminder(school, classKey);
            updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Sent." : "Failed."));
        });
    }

    useEffect(() => {
        if (!school) return;
        getClasses(school).then(setClasses);
        getCanteenReport(school, "summary").then((d) => setSummary(d && "sales_total" in d ? d : {}));
    }, [school]);
    useEffect(() => { if (today) setRange((r) => ({ from: r.from || today, to: r.to || today })); }, [today]);

    async function run(nextType = type) {
        if (!school) return;
        setLoading(true);
        const data = await getCanteenReport(school, nextType, nextType === "dues"
            ? { class_key: classKey || undefined }
            : nextType === "meals"
                ? { date: range.from || undefined }
                : { from: range.from || undefined, to: range.to || undefined });
        setReport(data && Array.isArray(data.rows) ? { ...data, type: nextType } : { rows: [], type: nextType });
        setLoading(false);
    }
    useEffect(() => { run(); /* eslint-disable-next-line */ }, [school, type]);

    if (!summary) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Today · {summary.date}</p>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <Tile label="Sales today" value={`Rs. ${rs(summary.sales_total)}`} tone="blue"
                        hint={`${summary.sales || 0} sale(s) · cash ${rs(summary.cash_sales)} · account ${rs(summary.account_sales)}`
                            + (summary.plan_meals ? ` · ${summary.plan_meals} on a plan` : "")} />
                    <Tile label="Cash to hand over" value={`Rs. ${rs(summary.cash_in_hand)}`} tone="green"
                        hint={`incl. receipts ${rs(summary.topups)} − refunds ${rs(summary.refunds)}`} />
                    <Tile label="Advance held" value={`Rs. ${rs(summary.held)}`} tone="gray" hint={`${summary.accounts || 0} account(s)`} />
                    <Tile label="Due" value={`Rs. ${rs(summary.owing)}`} tone={Number(summary.owing) > 0 ? "red" : "gray"}
                        hint="posted or taken on due, not yet collected" />
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Report">
                {REPORTS.map((r) => (
                    <button key={r.key} type="button" aria-pressed={type === r.key} onClick={() => setType(r.key)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${type === r.key
                            ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-solid,#0f766e)] text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
                        {r.label}
                    </button>
                ))}
            </div>

            <Section title={REPORTS.find((r) => r.key === type)?.label}
                description={type === "dues"
                    ? "Who owes the canteen what, item by item, as of now. Pick a class to narrow it — then print their bills or send an app reminder."
                    : type === "meals"
                        ? "The kitchen's count for a day, class by class: students on a monthly plan with counter meals, how many were served, and monthly items bought for cash or on due."
                    : type === "postings"
                        ? "Monthly postings dated between these days (BS). Withdrawn ones are listed but not counted."
                        : "Pick the dates (BS). Voided rows are listed but never counted."}>
                {type === "meals" ? (
                    <TextInput input={{ name: "from", label: "Day (BS)", mask: "date" }} value={range.from}
                        onChange={({ value }) => setRange((r) => ({ ...r, from: value }))} />
                ) : type === "dues" ? (
                    <SelectInput input={{ name: "class_key", label: "Class", options: [{ value: "", name: "Every class" },
                        ...classes.map((c) => ({ value: c.key, name: c.label }))] }}
                        value={classKey} onChange={({ value }) => setClassKey(value)} />
                ) : (
                    <>
                        <TextInput input={{ name: "from", label: "From (BS)", mask: "date" }} value={range.from}
                            onChange={({ value }) => setRange((r) => ({ ...r, from: value }))} />
                        <TextInput input={{ name: "to", label: "To (BS)", mask: "date" }} value={range.to}
                            onChange={({ value }) => setRange((r) => ({ ...r, to: value }))} />
                    </>
                )}
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" onClick={() => run()} disabled={loading}>{loading ? "Loading…" : "Show"}</Button>
            </ButtonsSecion>

            {report && report.type === type && (
                <>
                    <Totals type={type} report={report} />
                    {type === "dues" && report.rows.some((r) => Number(r.due) > 0) && (
                        <div className="flex flex-wrap items-center gap-2">
                            <Button size="sm" color="teal" className="normal-case flex items-center gap-1" onClick={() => setTimeout(() => printBills(), 50)}>
                                <PrinterIcon className="w-4 h-4" /> Print bills ({report.rows.filter((r) => Number(r.due) > 0).length})
                            </Button>
                            <Button size="sm" variant="outlined" className="normal-case flex items-center gap-1" disabled={busy || !report.with_app} onClick={onRemind}>
                                <BellAlertIcon className="w-4 h-4" /> {busy ? "Sending…" : "Send app reminder"}
                            </Button>
                            <span className="text-xs text-gray-500">{report.with_app || 0} of the families who owe have the app.</span>
                        </div>
                    )}
                    <BasicTable name={type === "dues"
                        ? `Canteen dues${classKey ? ` · ${classes.find((c) => c.key === classKey)?.label || ""}` : ""}`
                        : type === "meals"
                            ? `Canteen meal count ${report.date || ""}`
                            : `Canteen ${REPORTS.find((r) => r.key === type)?.label} ${report.from || ""} to ${report.to || ""}`}
                        columns={COLUMNS[type]} data={numbersOf(type, report.rows)} showSelected={false} dense print
                        loading={loading} />
                </>
            )}

            {/* Off-screen rather than unmounted: react-to-print clones the node. */}
            <div className="hidden">
                <div ref={billsRef}>
                    {report?.type === "dues" && <CanteenBills rows={report.rows} date={report.today || today} />}
                </div>
            </div>
        </div>
    );
}

function Totals({ type, report }) {
    let text = null;
    if (type === "sales") text = `${report.count || 0} sale(s) · Rs. ${rs(report.total)} (cash ${rs(report.cash)}, account ${rs(report.account)})${report.plan_meals ? ` · ${report.plan_meals} served on a plan` : ""}${report.voided ? ` · ${report.voided} voided` : ""}`;
    if (type === "postings") text = `${report.students || 0} student(s) · Rs. ${rs(report.total)} posted`
        + ((report.by_item || []).length ? ` (${report.by_item.map((t) => `${t.name} ${rs(t.amount)}`).join(", ")})` : "");
    if (type === "meals") text = `${report.date}: ${report.on_plan || 0} on a plan · ${report.served || 0} served · ${report.bought || 0} monthly item(s) bought`;
    if (type === "dues") text = `${report.students || 0} student(s) owe Rs. ${rs(report.due)} · advance held Rs. ${rs(report.advance)}`
        + ((report.by_item || []).length ? ` (${report.by_item.map((t) => `${t.name} ${rs(t.due)}`).join(", ")})` : "");
    if (type === "items") text = `${report.qty || 0} item(s) sold · Rs. ${rs(report.total)}`;
    if (type === "cashier") text = `Cash to hand over, all together: Rs. ${rs(report.cash_in_hand)}`;
    if (type === "receipts") text = `Top-ups Rs. ${rs(report.topups)} · refunds Rs. ${rs(report.refunds)}`;
    if (!text) return null;
    return <p className="text-sm font-semibold text-gray-800">{text}</p>;
}

export default CanteenReports;
