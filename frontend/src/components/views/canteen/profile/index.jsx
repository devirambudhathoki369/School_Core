import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { BanknotesIcon, ClockIcon, DocumentTextIcon, MagnifyingGlassIcon, PrinterIcon, UserIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import { Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { customAction } from "@/components/tables/actions";
import { TXN_POSTING } from "@/configs/canteen";
import { PERMISSIONS } from "@/configs/permissions";
import { useAppContext } from "@/contexts/AppContext";
import hasPermission from "@/methods/hasPermission";
import { formatImagePath } from "@/methods/formatMediaPath";
import { findPeople, getCanteenProfile, getOfficeReceipt, withdrawMonthlyPosting } from "@/services/functions/canteen";
import OfficeReceipt from "../accounts/OfficeReceipt";
import { CanteenTabs, Note, StatusPill, TabPanel, Tile, balanceText, balanceTone, rs, sumMoney, useCanteenScope } from "../common";
import CanteenBills from "../reports/CanteenBills";
import ManualPostingDialog from "./ManualPostingDialog";
import ProfileStatement from "./ProfileStatement";

const TABS = [
    { key: "billing", label: "Billing", icon: DocumentTextIcon },
    { key: "payments", label: "Payments", icon: BanknotesIcon },
    { key: "history", label: "Transaction history", icon: ClockIcon },
];

const reprintAction = customAction({ text: "Print", action: "reprint", icon: <PrinterIcon className="icon" />, tooltip: "Print this receipt" });
const RECEIPT_ACTIONS = [reprintAction];
const withdrawAction = customAction({ text: "Withdraw", action: "withdraw", tooltip: "Withdraw this posting" });

/** The small line under a row: what it was for, in plain words. */
function detailOf(row) {
    const items = (row.lines || [])
        .map((l) => `${l.name}${l.qty > 1 ? ` x${l.qty}` : ""}${row.group === "counter" && !row.cash ? "" : ` ${rs(l.amount)}`}`)
        .join(", ");
    const months = (row.months || []).length ? `${row.months.join(", ")}${row.bs_year ? ` ${row.bs_year}` : ""}` : "";
    const advance = Number(row.advance) > 0 ? `Advance ${rs(row.advance)}` : "";
    const discount = Number(row.discount) > 0 ? `Discount ${rs(row.discount)}` : "";
    const mode = row.mode_name ? `by ${row.mode_name}` : "";
    // A monthly bill's remark is only its own months and item, written by the posting.
    const remarks = row.kind === TXN_POSTING ? "" : row.remarks;
    return [months, items, advance, discount, mode, remarks].filter(Boolean).join(" · ");
}

function numberOrBlank(value) {
    return value === null || value === undefined ? "" : Number(value);
}

function WhenCell({ item }) {
    return (
        <span className="app-cell-text block px-2 whitespace-nowrap">
            {item?.date}
            <span className="block text-meta text-[var(--ink-500,#64748b)]">{item?.time}</span>
        </span>
    );
}

function WhatCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block break-words text-blue-gray-900 !font-semibold">
                {item?.what}{item?.reference ? ` · ${item.reference}` : ""}
            </span>
            <span className="block text-meta text-[var(--ink-500,#64748b)] lg:hidden">{item?.date}</span>
            {item?.detail && <span className="block break-words text-meta text-[var(--ink-500,#64748b)]">{item.detail}</span>}
            {item?.is_active === false && (
                <span className="mt-1 flex flex-wrap items-center gap-1">
                    <StatusPill text="Voided, not counted" tone="red" />
                    {item?.void_reason && <span className="text-meta text-[var(--ink-500,#64748b)]">{item.void_reason}</span>}
                </span>
            )}
        </div>
    );
}

function MoneyCell({ data, item }) {
    if (data === "" || data === null || data === undefined) {
        return <span className="app-cell-text block px-2 !text-[var(--ink-400,#94a3b8)]">—</span>;
    }
    return (
        <span className={`app-cell-text block px-2 whitespace-nowrap tabular-nums ${item?.is_active === false ? "line-through !text-[var(--ink-400,#94a3b8)]" : "text-blue-gray-900"}`}>
            {rs(data)}
        </span>
    );
}

function BalanceCell({ data }) {
    if (data === "" || data === null || data === undefined) return <span className="block px-2">—</span>;
    const n = Number(data);
    return (
        <span className={`app-cell-text block px-2 whitespace-nowrap tabular-nums ${n < 0 ? "!text-rose-700" : n > 0 ? "!text-green-700" : ""}`}>
            {n < 0 ? `${rs(-n)} due` : n > 0 ? `${rs(n)} advance` : rs(0)}
        </span>
    );
}

const BILL_COLUMNS = [
    ["date", "date", null, false, null, WhenCell],
    ["particulars", "bill", null, false, null, WhatCell],
    ["charged", "amount", null, false, null, MoneyCell],
    ["entered_by", "entered by"],
];
const PAYMENT_COLUMNS = [
    ["date", "date", null, false, null, WhenCell],
    ["particulars", "receipt", null, false, null, WhatCell],
    ["paid", "amount", null, false, null, MoneyCell],
    ["entered_by", "entered by"],
];
const HISTORY_COLUMNS = [
    ["date", "date", null, false, null, WhenCell],
    ["particulars", "what happened", null, false, null, WhatCell],
    ["charged", "billed", null, false, null, MoneyCell],
    ["paid", "paid", null, false, null, MoneyCell],
    ["running", "balance", null, false, null, BalanceCell],
    ["entered_by", "entered by"],
];

/** The person: photo, class, guardian, what they are on, and any warning. */
function WhoCard({ data, onChange }) {
    const [broken, setBroken] = useState(false);
    useEffect(() => { setBroken(false); }, [data?.image]);
    const facts = [data.detail, data.roll_no ? `Roll ${data.roll_no}` : ""].filter(Boolean).join(" · ");
    const family = [data.guardian, data.contact].filter(Boolean).join(" · ");
    return (
        <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 sm:p-4">
            <div className="flex min-w-0 flex-1 items-start gap-3">
                {data.image && !broken ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={formatImagePath(data.image)} alt="" onError={() => setBroken(true)}
                        className="h-16 w-16 shrink-0 rounded-full border border-gray-200 object-cover" />
                ) : (
                    <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                        <UserIcon className="h-8 w-8" />
                    </span>
                )}
                <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-gray-900">{data.name}</h2>
                    <p className="break-words text-sm text-gray-600">{data.buyer_type_name}{facts ? ` · ${facts}` : ""}</p>
                    {family && <p className="break-words text-sm text-gray-600">{data.guardian ? "Guardian: " : "Phone: "}{family}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-1">
                        {(data.plans || []).map((p) => <StatusPill key={p.name} text={p.name} tone="blue" />)}
                        {data.left && <StatusPill text="Left / inactive" tone="amber" />}
                        {data.is_blocked && <StatusPill text={data.block_reason ? `Card blocked: ${data.block_reason}` : "Card blocked"} tone="red" />}
                        {!data.is_blocked && <StatusPill text={data.has_card ? "Has a card" : "No card"} />}
                    </div>
                    {data.notes && <p className="mt-1.5 break-words text-sm font-semibold text-amber-800">Note: {data.notes}</p>}
                </div>
            </div>
            {onChange && <Button size="sm" variant="text" className="normal-case" onClick={onChange}>Someone else</Button>}
        </div>
    );
}

/** Item by item: billed − paid = due. Advance already used counts as paid. */
function ItemTable({ items }) {
    const rows = (items || []).map((r) => ({ ...r, settled: sumMoney([r.paid, r.from_advance]) }));
    return (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
                <thead className="bg-table-header text-left">
                    <tr>
                        <th className="px-3 py-2">Item</th>
                        <th className="px-3 py-2 text-right">Billed</th>
                        <th className="px-3 py-2 text-right">Paid</th>
                        <th className="px-3 py-2 text-right">Due</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length < 1 && (
                        <tr><td colSpan={4} className="px-3 py-3 text-gray-500">Nothing has been billed yet.</td></tr>
                    )}
                    {rows.map((r) => (
                        <tr key={r.item} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-semibold break-words">{r.name}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(r.charged)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(r.settled)}</td>
                            <td className={`px-3 py-2 text-right tabular-nums font-semibold ${Number(r.due) > 0 ? "text-rose-700" : ""}`}>{rs(r.due)}</td>
                        </tr>
                    ))}
                    {rows.length > 0 && (
                        <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                            <td className="px-3 py-2">Total</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(sumMoney(rows.map((r) => r.charged)))}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(sumMoney(rows.map((r) => r.settled)))}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{rs(sumMoney(rows.map((r) => r.due)))}</td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
}

/**
 * STUDENT PROFILE — one person's canteen page.
 *
 * Find them (card on the reader, roll number or name) and see, in one place, what
 * was billed, what was paid and what is due, with three separate views: their
 * billing, their payments and their whole transaction history.
 *
 * This is the canteen's own billing. School fees, fee receipts and the student
 * ledger are not read here at all (canteen/methods/profile.py on the server).
 * Money is taken at Canteen > Payment. Whoever holds Monthly Posting can also post to
 * this one person by hand from here.
 */
function CanteenProfile({ person = null, embedded = false }) {
    const { user: { user } } = useAppContext();
    const { school, today, updateNotification } = useCanteenScope();
    const canPost = hasPermission(user, PERMISSIONS.CANTEEN.MONTHLY_POSTING);
    const [posting, setPosting] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState("");
    const [tab, setTab] = useState("billing");
    const [receipt, setReceipt] = useState(null);
    const opening = useRef(0);
    const searchRef = useRef(null);
    const statementRef = useRef(null);
    const billRef = useRef(null);
    const receiptRef = useRef(null);
    const A4 = "@page { size: A4; margin: 8mm; }";
    const printStatement = useReactToPrint({ content: () => statementRef.current, pageStyle: A4 });
    const printBill = useReactToPrint({ content: () => billRef.current, pageStyle: A4 });
    const printReceipt = useReactToPrint({ content: () => receiptRef.current });

    useEffect(() => { if (!embedded) setTimeout(() => searchRef.current?.focus(), 100); }, [embedded]);
    // Opened from another page with the person already chosen.
    useEffect(() => { if (person && school) open(person); /* eslint-disable-next-line */ }, [person?.id, person?.buyer_type, school]);

    // Typing searches by name or roll number. A later answer always wins.
    useEffect(() => {
        const q = query.trim();
        if (!school || q.length < 2) { setResults(null); return undefined; }
        let current = true;
        const timer = setTimeout(async () => {
            const people = await findPeople(school, { q });
            if (current) setResults(people);
        }, 300);
        return () => { current = false; clearTimeout(timer); };
    }, [query, school]);

    // A card reader types the number and presses Enter.
    async function onSearchEnter(e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const value = query.trim();
        if (!value || !school) return;
        let people = await findPeople(school, { card: value });
        if (!people?.length) people = await findPeople(school, { q: value });
        if (people?.length === 1) open(people[0]);
        else setResults(people);
    }

    async function open(person) {
        const mine = ++opening.current;
        setLoading(true);
        setFailed("");
        setTab("billing");
        setQuery("");
        setResults(null);
        const res = await getCanteenProfile(school, person.buyer_type, person.id);
        if (mine !== opening.current) return;
        setLoading(false);
        if (res?.summary) setData(res);
        else {
            setData(null);
            setFailed(res?.message || "This profile could not be opened. Check the connection and try again.");
        }
    }
    async function reload() {
        const res = await getCanteenProfile(school, data.buyer_type, data.id);
        if (res?.summary) setData(res);
    }
    async function onBillAction(action, id, row) {
        if (action !== "withdraw") return;
        if (row.kind !== TXN_POSTING) return updateNotification("", "A counter purchase is voided at the Counter.");
        if (row.is_active === false) return updateNotification("", "This one is already withdrawn.");
        if (!await confirmAction({
            tone: "warning", confirmText: "Withdraw",
            title: `Withdraw this posting of Rs. ${rs(row.charged)}?`,
            body: "It comes off the canteen account and stays listed as withdrawn. The months can be posted again. "
                + "If a receipt has already paid it, void that receipt first.",
        })) return;
        const [status, message] = await withdrawMonthlyPosting(school, Number(`${row.id}`.slice(1)));
        updateNotification(status === 200 ? 200 : 400, message || "Failed.");
        if (status === 200) reload();
    }
    function someoneElse() {
        opening.current += 1;
        setData(null);
        setFailed("");
        setLoading(false);
        setTimeout(() => searchRef.current?.focus(), 60);
    }

    const rows = useMemo(() => (data?.history || []).map((r) => {
        const detail = detailOf(r);
        return {
            ...r,
            detail,
            // A plain sentence too, because this is what Search and Excel read.
            particulars: [r.what, r.reference, detail, r.is_active ? "" : "voided"].filter(Boolean).join(" · "),
            charged: numberOrBlank(r.charged),
            paid: numberOrBlank(r.paid),
            running: numberOrBlank(r.running),
        };
    }), [data]);
    const bills = useMemo(() => rows.filter((r) => r.group === "bill"), [rows]);
    const payments = useMemo(() => rows.filter((r) => r.group === "payment"), [rows]);

    async function onPaymentAction(action, id, item) {
        if (action !== "reprint" || !item?.receipt) return;
        const res = await getOfficeReceipt(school, item.receipt);
        if (!res?.receipt_no) return updateNotification(400, res?.message || "That receipt could not be opened.");
        setReceipt(res);
        setTimeout(() => printReceipt(), 60);
    }

    const summary = data?.summary;
    const due = Number(summary?.due || 0);
    const advance = Number(summary?.advance || 0);
    const refunded = Number(summary?.refunded || 0);
    const billRow = data ? [{
        account: data.account, name: data.name, detail: data.detail, roll_no: data.roll_no,
        lines: (data.items || []).map((r) => ({ name: r.name, charged: r.charged, paid: sumMoney([r.paid, r.from_advance]), due: r.due })),
        advance: summary.advance, due: summary.due,
    }] : [];

    return (
        <div className="flex flex-col gap-y-4">
            {!data && !embedded && (
                <Section title="Find the student" description="Tap the card on the reader, or type a roll number or a name. Staff can be found the same way.">
                    <div className="sm:col-span-12 max-w-xl">
                        <div className="relative">
                            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchEnter}
                                aria-label="Find the student" placeholder="Tap card, or type roll no. / name"
                                className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm" autoComplete="off" />
                        </div>
                        {results === undefined && <p className="mt-2 text-sm text-rose-700">The search failed. Check the connection and try again.</p>}
                        {Array.isArray(results) && results.length < 1 && <p className="mt-2 text-sm text-gray-500">Nobody found for &quot;{query.trim()}&quot;.</p>}
                        {results?.length > 0 && (
                            <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                                {results.map((p) => (
                                    <li key={`${p.buyer_type}-${p.id}`}>
                                        <button type="button" onClick={() => open(p)}
                                            className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                                            <span className="min-w-0">
                                                <span className="block text-sm font-semibold truncate">{p.name}</span>
                                                <span className="block text-xs text-gray-500 truncate">
                                                    {p.detail}{p.roll_no ? ` · Roll ${p.roll_no}` : ""}{p.left ? " · Left / inactive" : ""}
                                                </span>
                                            </span>
                                            {p.account ? <StatusPill text={balanceText(p.balance)} tone={balanceTone(p.balance)} /> : <StatusPill text="No account" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </Section>
            )}

            {loading && <Loader />}
            {failed && <Note tone="red">{failed}</Note>}

            {data && !loading && (
                <>
                    <WhoCard data={data} onChange={embedded ? null : someoneElse} />

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <Tile label="Due now" value={`Rs. ${rs(due)}`} tone={due > 0 ? "red" : "green"} hint={due > 0 ? "still to pay" : "nothing to pay"} />
                        <Tile label="Total billed" value={`Rs. ${rs(summary.billed)}`} tone="blue" hint="monthly bills + counter on account" />
                        <Tile label="Total paid" value={`Rs. ${rs(summary.paid)}`} tone="green"
                            hint={[Number(summary.discount) > 0 ? `Rs. ${rs(summary.discount)} discount` : "",
                                refunded > 0 ? `Rs. ${rs(refunded)} given back` : ""].filter(Boolean).join(" · ") || "receipts at the canteen office"} />
                        <Tile label="Advance held" value={`Rs. ${rs(advance)}`} tone="gray" hint="kept for the next bill" />
                    </div>

                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                        {(summary.cash_sales > 0 || summary.plan_meals > 0) && (
                            <p>
                                {summary.cash_sales > 0 && `Paid in cash at the counter: Rs. ${rs(summary.cash_at_counter)} (${summary.cash_sales} sale${summary.cash_sales === 1 ? "" : "s"}). `}
                                {summary.plan_meals > 0 && `Meals served on a monthly plan: ${summary.plan_meals}. `}
                                These are already settled, so they are not on the bill.
                            </p>
                        )}
                        <p>This is the canteen&apos;s own billing. School fees and fee receipts are separate and are not included here.</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CanteenTabs label="Canteen record" tabs={TABS} active={tab} onChange={setTab} />
                        <div className="flex flex-wrap gap-2">
                            {canPost && (
                                <Button size="sm" variant="outlined" className="normal-case" onClick={() => setPosting(true)}>Post manually</Button>
                            )}
                            {due > 0 && (
                                <Button size="sm" variant="outlined" className="normal-case flex items-center gap-1" onClick={() => setTimeout(() => printBill(), 50)}>
                                    <DocumentTextIcon className="w-4 h-4" aria-hidden="true" /> Print bill
                                </Button>
                            )}
                            <Button size="sm" color="teal" className="normal-case flex items-center gap-1" onClick={() => setTimeout(() => printStatement(), 50)}>
                                <PrinterIcon className="w-4 h-4" aria-hidden="true" /> Print statement
                            </Button>
                        </div>
                    </div>

                    {tab === "billing" && (
                        <TabPanel tab="billing">
                            <ItemTable items={data.items} />
                            <BasicTable name={`Canteen bills · ${data.name}`} columns={BILL_COLUMNS} data={bills} showSelected={false} dense
                                wideColumns={["entered_by"]} mobileColumns={["particulars", "charged"]}
                                actions={canPost ? [withdrawAction] : undefined} onSelect={onBillAction} />
                        </TabPanel>
                    )}
                    {tab === "payments" && (
                        <TabPanel tab="payments">
                            <BasicTable name={`Canteen payments · ${data.name}`} columns={PAYMENT_COLUMNS} data={payments} showSelected={false} dense
                                wideColumns={["entered_by"]} mobileColumns={["particulars", "paid"]}
                                actions={RECEIPT_ACTIONS} onSelect={onPaymentAction} />
                        </TabPanel>
                    )}
                    {tab === "history" && (
                        <TabPanel tab="history">
                            <BasicTable name={`Canteen transactions · ${data.name}`} columns={HISTORY_COLUMNS} data={rows} showSelected={false} dense includeSN={false}
                                wideColumns={["entered_by"]} mobileColumns={["particulars", "charged", "paid"]} />
                        </TabPanel>
                    )}
                </>
            )}

            {data && (
                <ManualPostingDialog open={posting} person={data} school={school} today={today}
                    onClose={() => setPosting(false)}
                    onPosted={(message) => {
                        setPosting(false);
                        updateNotification(200, message);
                        reload();
                    }} />
            )}

            {/* Off-screen rather than unmounted: react-to-print clones the node. */}
            <div className="hidden">
                <div ref={statementRef}><ProfileStatement data={data} /></div>
                <div ref={billRef}>{due > 0 && <CanteenBills rows={billRow} date={data?.today} />}</div>
                <div ref={receiptRef}><OfficeReceipt receipt={receipt} /></div>
            </div>
        </div>
    );
}

export default CanteenProfile;
