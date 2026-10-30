import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { MagnifyingGlassIcon, PrinterIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { MODES, TXN_REFUND, TXN_TOPUP } from "@/configs/canteen";
import {
    findBuyers, getAccount, getOfficeReceipt, moveMoney, voidOfficeReceipt,
} from "@/services/functions/canteen";
import OfficeReceipt from "../accounts/OfficeReceipt";
import { StatusPill, Tile, balanceText, balanceTone, paisa, rs, sumMoney, useCanteenScope, useOnce } from "../common";

/**
 * COLLECT & RECEIPT — the canteen's own collection, item by item.
 *
 * Find the student (card on the reader, roll number or name); their canteen
 * dues are listed item by item — Tiffin, Day care, the counter items taken on
 * due — exactly as the dues report adds them up. Enter what is paid against
 * each; anything over is kept as an advance (a top-up) and meets the next
 * posting. The receipt is the canteen's own, numbered C-1, C-2… and never
 * touches the school's fee receipts.
 */
function CanteenCollect() {
    const { school, today, updateNotification } = useCanteenScope();
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [buyer, setBuyer] = useState(null);
    const [account, setAccount] = useState(null);
    const [paying, setPaying] = useState({});
    const [advance, setAdvance] = useState("");
    const [mode, setMode] = useState(1);
    const [date, setDate] = useState(today);
    const [remarks, setRemarks] = useState("");
    const [receipt, setReceipt] = useState(null);
    const [busy, once] = useOnce();
    const searchRef = useRef(null);
    const receiptRef = useRef(null);
    const print = useReactToPrint({ content: () => receiptRef.current });

    useEffect(() => { if (today) setDate(today); }, [today]);
    useEffect(() => { setTimeout(() => searchRef.current?.focus(), 100); }, []);
    useEffect(() => {
        const q = query.trim();
        if (!school || buyer || q.length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => setResults((await findBuyers(school, { q })).buyers), 300);
        return () => clearTimeout(timer);
    }, [query, buyer, school]);

    async function onSearchEnter(e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const value = query.trim();
        if (!value) return;
        let { buyers } = await findBuyers(school, { card: value });
        if (!buyers.length) ({ buyers } = await findBuyers(school, { q: value }));
        if (buyers.length === 1) pick(buyers[0]);
        else if (buyers.length > 1) setResults(buyers);
        else updateNotification("", `Nobody found for "${value}".`);
    }
    async function load(accountId) {
        if (!accountId) { setAccount(null); return; }
        const data = await getAccount(school, accountId);
        setAccount(data?.id ? data : null);
        setPaying({});
        setAdvance("");
    }
    function pick(b) {
        setBuyer(b);
        setResults([]);
        setQuery("");
        load(b.account);
    }
    function reset() {
        setBuyer(null);
        setAccount(null);
        setPaying({});
        setAdvance("");
        setRemarks("");
        setTimeout(() => searchRef.current?.focus(), 60);
    }

    const items = account?.dues?.items || [];
    const totalPaying = sumMoney([...Object.values(paying), advance]);
    const overpaid = items.find((r) => paisa(paying[r.item]) > paisa(r.raw_due));

    function payAll() {
        setPaying(Object.fromEntries(items.filter((r) => Number(r.due) > 0).map((r) => [r.item, `${Number(r.due)}`])));
    }

    async function onCollect() {
        if (!buyer) return;
        if (!(totalPaying > 0)) return updateNotification("", "Enter what is being paid.");
        if (overpaid) return updateNotification("", `${overpaid.name}: more than is due.`);
        const details = Object.fromEntries(Object.entries(paying).filter(([, v]) => Number(v) > 0));
        if (!await confirmAction({
            tone: "info", confirmText: "Collect",
            title: `Collect Rs. ${rs(totalPaying)} from ${buyer.name}?`,
            body: "A canteen receipt is numbered and printed. A receipt entered by mistake is voided, which keeps it on the record.",
        })) return;
        await once(async () => {
            const [status, message, data] = await moveMoney({
                school, action: "topup", account: account?.id || undefined,
                buyer_type: buyer.buyer_type, buyer: buyer.id, amount: totalPaying, details,
                mode: Number(mode), date: date || undefined, remarks: remarks || undefined,
            });
            if (status !== 200 || !data?.receipt_no) return updateNotification(400, message || "Nothing was saved.");
            updateNotification(200, data.message || "Saved.");
            setRemarks("");
            await load(data.account);
            printReceipt(data.id);
        });
    }
    async function printReceipt(txnId) {
        const data = await getOfficeReceipt(school, txnId);
        if (!data?.receipt_no) return;
        setReceipt(data);
        setTimeout(() => print(), 60);
    }
    async function onVoid(row) {
        if (!await confirmAction({
            title: `Void receipt C-${row.receipt_no}?`, confirmText: "Void receipt",
            body: "Whatever it paid is due again. It stays on the record with its number, which is never reused.",
        })) return;
        const [status, message] = await voidOfficeReceipt(school, row.id, "voided at Collect & Receipt");
        updateNotification(status === 200 ? 200 : 400, message || "Failed.");
        if (status === 200) load(account?.id);
    }

    const receipts = (account?.statement || []).filter((r) => r.kind === TXN_TOPUP || r.kind === TXN_REFUND);

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Who is paying" description="Tap the card on the reader, or type a roll number or a name.">
                <div className="sm:col-span-12">
                    {!buyer ? (
                        <div className="max-w-xl">
                            <div className="relative">
                                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchEnter}
                                    aria-label="Find the student" placeholder="Tap card, or type roll no. / name"
                                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm" autoComplete="off" />
                            </div>
                            {results.length > 0 && (
                                <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
                                    {results.map((b) => (
                                        <li key={`${b.buyer_type}-${b.id}`}>
                                            <button type="button" onClick={() => pick(b)}
                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-semibold truncate">{b.name}</span>
                                                    <span className="block text-xs text-gray-500 truncate">{b.detail}{b.roll_no ? ` · Roll ${b.roll_no}` : ""}</span>
                                                </span>
                                                {b.account ? <StatusPill text={balanceText(b.balance)} tone={balanceTone(b.balance)} /> : <StatusPill text="No account" />}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <span className="min-w-0">
                                <span className="block font-semibold">{buyer.name}</span>
                                <span className="block text-xs text-gray-500">{buyer.detail}{buyer.roll_no ? ` · Roll ${buyer.roll_no}` : ""}</span>
                            </span>
                            <Button size="sm" variant="text" className="normal-case" onClick={reset}>Someone else</Button>
                        </div>
                    )}
                </div>
            </Section>

            {buyer && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                        <Tile label="Due" value={`Rs. ${rs(account?.dues?.due || 0)}`} tone={Number(account?.dues?.due) > 0 ? "red" : "green"} />
                        <Tile label="Advance held" value={`Rs. ${rs(account?.dues?.advance || 0)}`} tone="gray" />
                        <Tile label="Paying now" value={`Rs. ${rs(totalPaying)}`} tone="blue" />
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left">
                                <tr>
                                    <th className="px-3 py-2">Item</th>
                                    <th className="px-3 py-2 text-right hidden sm:table-cell">Charged</th>
                                    <th className="px-3 py-2 text-right hidden sm:table-cell">Paid</th>
                                    <th className="px-3 py-2 text-right">Due</th>
                                    <th className="px-3 py-2 text-right sm:w-48">Paying now</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.length < 1 && (
                                    <tr><td colSpan={5} className="px-3 py-3 text-sm text-gray-500">Nothing charged on this canteen account yet.</td></tr>
                                )}
                                {items.map((r) => (
                                    <tr key={r.item} className="border-t border-gray-100">
                                        <td className="px-3 py-2 font-semibold">{r.name}</td>
                                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{rs(r.charged)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{rs(r.paid)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{rs(r.due)}</td>
                                        <td className="px-3 py-2 text-right">
                                            <input type="number" step="0.01" min="0" aria-label={`Paying for ${r.name}`}
                                                className={`w-24 sm:w-40 rounded border px-2 py-1 text-right ${paisa(paying[r.item]) > paisa(r.raw_due) ? "border-rose-500" : "border-gray-300"}`}
                                                value={paying[r.item] ?? ""} disabled={!(Number(r.raw_due) > 0)}
                                                onChange={(e) => setPaying((s) => ({ ...s, [r.item]: e.target.value }))} />
                                        </td>
                                    </tr>
                                ))}
                                <tr className="border-t border-gray-100 bg-gray-50/60">
                                    <td className="px-3 py-2 font-semibold hidden sm:table-cell" colSpan={4}>
                                        Advance / top-up
                                        <span className="block text-xs font-normal text-gray-500">Kept on the account; it meets the next posting or counter purchase.</span>
                                    </td>
                                    <td className="px-3 py-2 font-semibold sm:hidden" colSpan={2}>
                                        Advance
                                        <span className="block text-xs font-normal text-gray-500">Kept on the account; it meets the next posting or counter purchase.</span>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <input type="number" step="0.01" min="0" aria-label="Advance" value={advance}
                                            onChange={(e) => setAdvance(e.target.value)}
                                            className="w-24 sm:w-40 rounded border border-gray-300 px-2 py-1 text-right" />
                                    </td>
                                </tr>
                                <tr className="border-t-2 border-gray-300 bg-gray-50">
                                    <td className="px-3 py-2 font-bold hidden sm:table-cell" colSpan={4}>Total</td>
                                    <td className="px-3 py-2 font-bold sm:hidden" colSpan={2}>Total</td>
                                    <td className="px-3 py-2 font-bold text-right tabular-nums">{rs(totalPaying)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <Section title={null} description={null}>
                        <SelectInput input={{ name: "mode", label: "Mode", options: MODES }} value={mode} onChange={({ value }) => setMode(value)} />
                        <TextInput input={{ name: "date", label: "Receipt date (BS)", mask: "date" }} value={date} onChange={({ value }) => setDate(value)} />
                        <TextInput input={{ name: "remarks", label: "Remarks (cheque no., etc.)" }} value={remarks} onChange={({ value }) => setRemarks(value)} />
                    </Section>
                    <ButtonsSecion>
                        <Button variant="text" className="normal-case" disabled={!items.some((r) => Number(r.due) > 0)} onClick={payAll}>Pay full dues</Button>
                        <Button color="teal" className="normal-case" disabled={busy || !(totalPaying > 0) || !!overpaid} onClick={onCollect}>
                            {busy ? "Saving…" : `Collect Rs. ${rs(totalPaying)}`}
                        </Button>
                    </ButtonsSecion>

                    {receipts.length > 0 && (
                        <Section title="Canteen receipts" description="Every receipt and refund on this account. A voided one keeps its number.">
                            <div className="sm:col-span-12 overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left">
                                        <tr>
                                            <th className="px-3 py-2">No.</th>
                                            <th className="px-3 py-2">Date</th>
                                            <th className="px-3 py-2">Paid for</th>
                                            <th className="px-3 py-2 text-right">Amount</th>
                                            <th className="px-3 py-2">By</th>
                                            <th className="px-3 py-2 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {receipts.map((r) => (
                                            <tr key={r.id} className={`border-t border-gray-100 ${r.is_active ? "" : "opacity-50"}`}>
                                                <td className="px-3 py-1.5 font-semibold">C-{r.receipt_no}</td>
                                                <td className="px-3 py-1.5 whitespace-nowrap">{r.date} {r.time}</td>
                                                <td className="px-3 py-1.5 text-xs">
                                                    {r.kind === TXN_REFUND ? "Refund" : (r.lines || []).map((l) => `${l.name} ${rs(l.amount)}`).join(", ") || "Advance"}
                                                    {!r.is_active && <> <StatusPill text="Voided" tone="red" /></>}
                                                </td>
                                                <td className="px-3 py-1.5 text-right tabular-nums">{rs(Math.abs(Number(r.amount)))}</td>
                                                <td className="px-3 py-1.5">{r.entered_by}</td>
                                                <td className="px-3 py-1.5">
                                                    <div className="flex justify-end gap-1">
                                                        <button type="button" aria-label={`Print receipt C-${r.receipt_no}`} onClick={() => printReceipt(r.id)}
                                                            className="p-1.5 rounded bg-teal-50 text-teal-700"><PrinterIcon className="w-4 h-4" /></button>
                                                        {r.is_active && (
                                                            <button type="button" aria-label={`Void receipt C-${r.receipt_no}`} onClick={() => onVoid(r)}
                                                                className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                        )}
                                                    </div>
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

            <div className="hidden">
                <div ref={receiptRef}><OfficeReceipt receipt={receipt} /></div>
            </div>
        </div>
    );
}

export default CanteenCollect;
