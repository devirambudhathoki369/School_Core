import ExtraBillingReceipt from "../Receipt";
import { useEffect, useRef, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PrinterIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useReactToPrint } from "react-to-print";

import { confirmAction } from "@/components/ConfirmDialog";
import { SearchInput, SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import Loader from "@/components/Loader";
import { OPENING_DUE, PAYMENT_MODES } from "@/configs/extra_billing";
import {
    collectPayment, getPartyAccount, getReceipt, voidReceipt,
} from "@/services/functions/extra_billing";
import { SetupNeeded, StatusPill, Tile, rs, useExtraBillingScope } from "../common";

/**
 * COLLECTING FROM A PARTY, AND THE RECEIPT IT PRODUCES.
 *
 * The form is title by title, like a student receipt, because that is what a
 * payer disputes: not "Rs. 12,500" but "I paid the rent, not the water".
 *
 * The outstanding column comes from the same arithmetic as the dues report and
 * the statement (`methods/balances` on the server), so the number collected
 * against here cannot drift from the number the report shows.
 *
 * Voiding keeps the receipt AND its number. A gap in a receipt book is a
 * record; a reused number is a fraud.
 */
function ExtraBillingPayment() {
    const { user, school, parties, party, setParty, options, loading, reload, updateNotification } =
        useExtraBillingScope();

    const [account, setAccount] = useState(null);
    const [amounts, setAmounts] = useState({});
    const [date, setDate] = useState(user?.today_npt || user?.today || "");
    const [mode, setMode] = useState(1);
    const [remarks, setRemarks] = useState("");
    const [saving, setSaving] = useState(false);
    const [printing, setPrinting] = useState(null);
    const receiptRef = useRef(null);

    const print = useReactToPrint({ content: () => receiptRef.current });

    async function load() {
        if (!party) { setAccount(null); return; }
        const data = await getPartyAccount(school, party);
        setAccount(data?.outstanding ? data : null);
        setAmounts({});
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [party]);

    const total = Object.values(amounts).reduce((sum, v) => sum + Number(v || 0), 0);

    function fillDues() {
        const next = {};
        (account?.outstanding || []).forEach((row) => {
            if (Number(row.due) > 0) next[row.title] = row.due;
        });
        setAmounts(next);
    }

    async function onCollect(e) {
        e.preventDefault();
        if (total <= 0) return updateNotification("", "Enter an amount to collect.");
        const ok = await confirmAction({
            title: `Collect Rs. ${rs(total)} from ${account?.party?.name}?`,
            // Taking money is not a deletion: left to the dialog's defaults
            // this asked "Collect …?" over a red Delete button and a bin.
            tone: "info",
            confirmText: "Collect",
            body: "A receipt number is issued and cannot be reused. A receipt entered by mistake is voided, "
                + "which keeps it on the record.",
        });
        if (!ok) return;
        setSaving(true);
        const details = Object.entries(amounts).reduce((acc, [title, value]) => {
            if (Number(value || 0) > 0) acc[title] = value;
            return acc;
        }, {});
        const [status, message, data] = await collectPayment({
            school, party, details, date: date || undefined, mode,
            remarks: remarks || undefined,
        });
        setSaving(false);
        if (status === 200) {
            updateNotification(200, data?.message || message || "Saved!");
            setRemarks("");
            await load(); reload();
            onPrint(data?.id);
        } else updateNotification(400, message || "Failed.");
    }

    async function onPrint(receiptId) {
        if (!receiptId) return;
        const data = await getReceipt(school, receiptId);
        if (!data?.invoice_id) return;
        setPrinting(data);
        // One tick so the hidden receipt is in the DOM before the dialog opens.
        setTimeout(() => print(), 50);
    }

    async function onVoid(receipt) {
        const ok = await confirmAction({
            title: `Void receipt No. ${receipt.invoice_id}?`,
            confirmText: "Void receipt",
            body: "It stops counting towards what this party has paid, and stays on the record with its number. "
                + "The number is never given to another receipt.",
        });
        if (!ok) return;
        const [status, message] = await voidReceipt(school, receipt.id, "voided from payment screen");
        if (status === 200) { updateNotification(200, message || "Voided."); load(); reload(); }
        else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;
    if (parties.length < 1) return <SetupNeeded what="parties" where="Extra Billing > Parties & Charges" />;


    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Collect from a party"
                description="Pick who is paying. What they owe is shown title by title, exactly as the dues report shows it.">
                <SearchInput input={{ name: "party", label: "Party", options }} value={party}
                    onChange={({ value }) => setParty(value)} />
            </Section>

            {account && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Tile label="Charged" value={`Rs. ${rs(account.charged)}`} tone="blue" />
                        <Tile label="Paid" value={`Rs. ${rs(account.paid)}`} tone="green" />
                        <Tile label="Old dues" value={`Rs. ${rs(account.opening)}`} tone="gray" />
                        <Tile label="Balance" value={`Rs. ${rs(account.balance)}`}
                            tone={Number(account.balance) > 0 ? "amber" : "green"} />
                    </div>

                    <form onSubmit={onCollect}>
                        <div className="overflow-x-auto rounded-lg border border-gray-200">
                            <table className="w-full text-sm">
                                <thead className="bg-table-header text-left">
                                    <tr>
                                        <th className="px-3 py-2">Title</th>
                                        <th className="px-3 py-2 text-right">Charged</th>
                                        <th className="px-3 py-2 text-right">Paid</th>
                                        <th className="px-3 py-2 text-right">Due</th>
                                        <th className="px-3 py-2 text-right w-48">Paying now (Rs.)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {account.outstanding.map((row) => (
                                        <tr key={row.title} className="border-t border-gray-100">
                                            <td className="px-3 py-2 font-semibold">
                                                {row.name}{row.title === OPENING_DUE && (
                                                    <span className="ml-2 text-[11px] text-gray-500">(brought forward)</span>
                                                )}
                                            </td>
                                            <td className="px-3 py-2 text-right">{rs(row.charged)}</td>
                                            <td className="px-3 py-2 text-right">{rs(row.paid)}</td>
                                            <td className="px-3 py-2 text-right font-semibold">{rs(row.due)}</td>
                                            <td className="px-3 py-2 text-right">
                                                <input type="number" step="0.01" min="0"
                                                    className="w-40 rounded border border-gray-300 px-2 py-1 text-right"
                                                    value={amounts[row.title] ?? ""}
                                                    onChange={(e) => setAmounts((s) => ({ ...s, [row.title]: e.target.value }))} />
                                            </td>
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                                        <td className="px-3 py-2 font-bold" colSpan={4}>Total</td>
                                        <td className="px-3 py-2 font-bold text-right">{rs(total)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <Section title={null} description={null}>
                            <TextInput input={{ name: "date", label: "Receipt date (BS)" }} value={date}
                                onChange={({ value }) => setDate(value)} />
                            <SelectInput input={{ name: "mode", label: "Mode", options: PAYMENT_MODES }}
                                value={mode} onChange={({ value }) => setMode(value)} />
                            <TextInput input={{ name: "remarks", label: "Remarks (cheque no., etc.)" }}
                                value={remarks} onChange={({ value }) => setRemarks(value)} />
                        </Section>

                        <ButtonsSecion>
                            <Button variant="text" type="button" onClick={fillDues}>Pay full dues</Button>
                            <Button variant="outlined" type="submit" disabled={saving || total <= 0}>
                                {saving ? "Saving…" : `Collect Rs. ${rs(total)}`}
                            </Button>
                        </ButtonsSecion>
                    </form>

                    <Section title="Receipts"
                        description="Every receipt issued to this party. A voided one keeps its number and stays here.">
                        <div className="sm:col-span-12">
                            {account.receipts.length < 1 ? (
                                <p className="text-sm text-gray-500">Nothing collected from them yet.</p>
                            ) : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                    <table className="w-full text-sm">
                                        <thead className="bg-table-header text-left">
                                            <tr>
                                                <th className="px-3 py-2">No.</th>
                                                <th className="px-3 py-2">Date</th>
                                                <th className="px-3 py-2">Mode</th>
                                                <th className="px-3 py-2 text-right">Paid</th>
                                                <th className="px-3 py-2 text-right">Balance then</th>
                                                <th className="px-3 py-2">Remarks</th>
                                                <th className="px-3 py-2 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {account.receipts.map((r) => (
                                                <tr key={r.id} className={`border-t border-gray-100 ${r.is_active ? "" : "opacity-50 line-through"}`}>
                                                    <td className="px-3 py-2 font-semibold">{r.invoice_id}</td>
                                                    <td className="px-3 py-2">{r.date}</td>
                                                    <td className="px-3 py-2 capitalize">{r.mode_name}</td>
                                                    <td className="px-3 py-2 text-right font-semibold">{rs(r.total_paid)}</td>
                                                    <td className="px-3 py-2 text-right">{rs(r.total_due)}</td>
                                                    <td className="px-3 py-2">
                                                        {r.is_active ? (r.remarks || "—") : <StatusPill text="Voided" tone="red" />}
                                                    </td>
                                                    <td className="px-3 py-2">
                                                        <div className="flex items-center justify-end gap-x-1">
                                                            <button type="button" aria-label="Print receipt"
                                                                onClick={() => onPrint(r.id)}
                                                                className="p-1.5 rounded bg-teal-50 text-teal-700"><PrinterIcon className="w-4 h-4" /></button>
                                                            {r.is_active && (
                                                                <button type="button" aria-label="Void receipt"
                                                                    onClick={() => onVoid(r)}
                                                                    className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </Section>
                </>
            )}

            {/* The printable receipt. Off-screen rather than unmounted:
                react-to-print needs the node to exist to clone it. */}
            <div className="hidden">
                <div ref={receiptRef}>
                    {printing && (
                        <ExtraBillingReceipt receipt={printing} />
                    )}
                </div>
            </div>
        </div>
    );
}

export default ExtraBillingPayment;
