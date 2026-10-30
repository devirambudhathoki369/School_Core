import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { customAction, viewAction } from "@/components/tables/actions";
import { getAccounts, getOfficeReceipt } from "@/services/functions/canteen";
import { Note, StatusPill, Tile, balanceText, balanceTone, rs, sumMoney, useCanteenScope } from "../common";
import AccountDialog from "./AccountDialog";
import MoneyDialog from "./MoneyDialog";
import OfficeReceipt from "./OfficeReceipt";

const topUpAction = customAction({ text: "Top up", action: "topup", tooltip: "Top up this account" });
const ACCOUNT_ACTIONS = [viewAction, topUpAction];
const FILTERS = [
    { key: "", label: "All" },
    { key: "held", label: "Money held" },
    { key: "owing", label: "Due" },
    { key: "blocked", label: "Blocked cards" },
];

function WhoCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block break-words text-blue-gray-900 !font-semibold">{item?.name}</span>
            <span className="block text-meta text-[var(--ink-500,#64748b)]">
                {[item?.buyer_type_name, item?.detail, item?.roll_no ? `Roll ${item.roll_no}` : ""].filter(Boolean).join(" · ")}
            </span>
            {(item?.is_blocked || item?.left) && (
                <span className="mt-1 flex gap-1">
                    {item?.is_blocked && <StatusPill text="Blocked" tone="red" />}
                    {item?.left && <StatusPill text="Left / inactive" tone="amber" />}
                </span>
            )}
        </div>
    );
}
function Balance({ data }) {
    return <span className="block px-2"><StatusPill text={balanceText(data)} tone={balanceTone(data)} /></span>;
}
function Money({ data }) {
    return (
        <span className={`app-cell-text block px-2 whitespace-nowrap tabular-nums ${Number(data) ? "text-blue-gray-900" : "!text-[var(--ink-400,#94a3b8)]"}`}>
            {rs(data)}
        </span>
    );
}
function Limit({ data }) {
    return <span className="app-cell-text block px-2 whitespace-nowrap tabular-nums">{Number(data) > 0 ? rs(data) : "—"}</span>;
}

const COLUMNS = [
    ["name", "account of", null, false, null, WhoCell],
    ["balance", "balance", null, false, null, Balance],
    ["spent_today", "spent today", null, false, null, Money],
    ["daily_limit", "daily limit", null, false, null, Limit],
    ["credit_limit", "credit allowed", null, false, null, Limit],
    ["contact", "contact"],
    ["notes", "counter note"],
];

/**
 * CARD ACCOUNTS — one per student or member of staff who uses the canteen.
 *
 * A family tops up here at the office and gets a numbered receipt; the card is
 * then spent at the counter. Where the school allows credit, an account can go
 * below zero down to its limit; monthly postings land here too, and every due
 * is collected item-wise at Canteen > Collect & Receipt.
 *
 * An account opens by itself on its first top-up or account purchase — there
 * is nothing to "create" first.
 */
function CanteenAccounts() {
    const { school, today, settings, updateNotification } = useCanteenScope();
    const [rows, setRows] = useState(null);
    const [filter, setFilter] = useState("");
    const [viewing, setViewing] = useState(null);
    const [money, setMoney] = useState({ open: false, action: "topup", buyer: null });
    const [receipt, setReceipt] = useState(null);
    const receiptRef = useRef(null);
    const print = useReactToPrint({ content: () => receiptRef.current });

    async function load() {
        if (!school) return;
        setRows(await getAccounts(school));
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    const all = useMemo(() => (rows || []).map((r) => ({
        ...r, balance: Number(r.balance || 0), spent_today: Number(r.spent_today || 0),
        daily_limit: Number(r.daily_limit || 0), credit_limit: Number(r.credit_limit || 0),
    })), [rows]);
    const shown = useMemo(() => all.filter((r) => {
        if (filter === "held") return r.balance > 0;
        if (filter === "owing") return r.balance < 0;
        if (filter === "blocked") return r.is_blocked;
        return true;
    }), [all, filter]);
    const held = sumMoney(all.filter((r) => r.balance > 0).map((r) => r.balance));
    const owing = sumMoney(all.filter((r) => r.balance < 0).map((r) => -r.balance));

    function onAction(action, id, item) {
        if (action === "view") setViewing(item.id);
        else if (action === "topup") setMoney({ open: true, action: "topup", buyer: item });
    }
    async function printReceipt(txnId) {
        const data = await getOfficeReceipt(school, txnId);
        if (!data?.receipt_no) return;
        setReceipt(data);
        setTimeout(() => print(), 60);
    }
    function onMoneyDone(data) {
        setMoney((s) => ({ ...s, open: false }));
        updateNotification(200, data.message || "Saved!");
        load();
        printReceipt(data.id);
    }

    if (!settings || rows === null) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            {!settings.allow_account && (
                <Note tone="amber">Paying from the account at the counter is switched off in Canteen Setup, so the counter takes cash. Monthly postings, dues and receipts work as usual.</Note>
            )}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="Accounts" value={all.length} tone="blue" />
                <Tile label="Money held" value={`Rs. ${rs(held)}`} tone="green" hint="families' top-ups not yet spent" />
                <Tile label="Due" value={`Rs. ${rs(owing)}`} tone={owing > 0 ? "red" : "gray"} hint="posted or taken on due, not yet paid" />
                <Tile label="Blocked cards" value={all.filter((r) => r.is_blocked).length} tone="amber" />
            </div>

            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${filter === f.key
                            ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-solid,#0f766e)] text-white"
                            : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
                        {f.label}
                    </button>
                ))}
            </div>

            <BasicTable name="Canteen accounts" columns={COLUMNS} detailColumns={["contact", "notes"]} rowView={false}
                mobileColumns={["name", "balance"]} data={shown} showSelected={false} dense
                actions={ACCOUNT_ACTIONS} onSelect={onAction}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1"
                        onClick={() => setMoney({ open: true, action: "topup", buyer: null })}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Top up
                    </Button>
                } />

            <AccountDialog accountId={viewing} school={school} settings={settings} updateNotification={updateNotification}
                onClose={() => setViewing(null)} onChanged={load} onPrintReceipt={printReceipt}
                onTopUp={(acc) => { setViewing(null); setMoney({ open: true, action: "topup", buyer: acc }); }}
                onRefund={(acc) => { setViewing(null); setMoney({ open: true, action: "refund", buyer: acc }); }} />
            <MoneyDialog open={money.open} action={money.action} buyer={money.buyer} school={school} today={today}
                onClose={() => setMoney((s) => ({ ...s, open: false }))} onDone={onMoneyDone} />

            <div className="hidden">
                <div ref={receiptRef}><OfficeReceipt receipt={receipt} /></div>
            </div>
        </div>
    );
}

export default CanteenAccounts;
