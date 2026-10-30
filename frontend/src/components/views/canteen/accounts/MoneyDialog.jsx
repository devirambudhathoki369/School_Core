import { useEffect, useId, useRef, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { BanknotesIcon, ExclamationCircleIcon, MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { MODES } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { findBuyers, moveMoney } from "@/services/functions/canteen";
import { StatusPill, balanceText, balanceTone, rs } from "../common";

/**
 * Money across the office desk: a top-up, or a refund of what is left.
 *
 * `buyer` given = the account the dialog was opened from (no search); without
 * it the dialog starts with a search — tap the card on the reader, or type a
 * roll number or a name, exactly as at the counter.
 *
 * `action` is "topup" or "refund". A refund can never give back more than is on
 * the account (the server refuses it too).
 */
function MoneyDialog({ open, action = "topup", buyer: fixedBuyer, school, today, onClose, onDone }) {
    const refund = action === "refund";
    const [buyer, setBuyer] = useState(null);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState([]);
    const [form, setForm] = useState({ amount: "", mode: 1, date: today, remarks: "" });
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const searchRef = useRef(null);
    const amountId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!open) return;
        setBuyer(fixedBuyer || null);
        setQuery(""); setResults([]); setFormError("");
        setForm({ amount: refund && fixedBuyer ? `${Math.max(Number(fixedBuyer.balance || 0), 0) || ""}` : "", mode: 1, date: today, remarks: "" });
        const timer = setTimeout(() => (fixedBuyer ? document.getElementById(amountId) : searchRef.current)?.focus(), 90);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, fixedBuyer, action]);

    useEffect(() => {
        const q = query.trim();
        if (!open || buyer || q.length < 2) { setResults([]); return; }
        const timer = setTimeout(async () => setResults((await findBuyers(school, { q })).buyers), 300);
        return () => clearTimeout(timer);
    }, [query, buyer, open, school]);

    async function onSearchEnter(e) {
        if (e.key !== "Enter") return;
        e.preventDefault();
        const value = query.trim();
        if (!value) return;
        let { buyers } = await findBuyers(school, { card: value });
        if (!buyers.length) ({ buyers } = await findBuyers(school, { q: value }));
        if (buyers.length === 1) pick(buyers[0]);
        else setResults(buyers);
    }
    function pick(b) {
        setBuyer(b); setResults([]); setQuery("");
        setTimeout(() => document.getElementById(amountId)?.focus(), 60);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        if (!buyer) return setFormError("Find the student or member of staff first.");
        const amount = Number(form.amount || 0);
        if (!(amount > 0)) return setFormError("Enter the amount.");
        if (refund && amount > Number(buyer.balance || 0)) {
            return setFormError(`Only Rs. ${rs(Math.max(Number(buyer.balance || 0), 0))} is on the account to give back.`);
        }
        setSaving(true);
        const [status, message, data] = await moveMoney({
            school, action, buyer_type: buyer.buyer_type, buyer: buyer.buyer ?? buyer.id,
            account: buyer.account || undefined, amount, mode: Number(form.mode || 1),
            date: form.date || undefined, remarks: form.remarks || undefined,
        });
        setSaving(false);
        if (status === 200 && data?.receipt_no) onDone({ ...data, name: buyer.name, detail: buyer.detail });
        else setFormError(message || "Nothing was saved; please try again.");
    }

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><BanknotesIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{refund ? "Give back canteen money" : "Top up a canteen account"}</span>
                        <span className="app-dialog-sub truncate">
                            {refund ? "Cash handed back from the account, with a numbered receipt." : "Money a family pays in at the office, with a numbered receipt."}
                        </span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>

                <DialogBody className="app-dialog-body flex flex-col gap-y-4">
                    {!buyer ? (
                        <div>
                            <div className="relative">
                                <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
                                <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onSearchEnter}
                                    aria-label="Find the account" placeholder="Tap card, or type roll no. / name"
                                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2.5 text-sm" autoComplete="off" />
                            </div>
                            {results.length > 0 && (
                                <ul className="mt-2 max-h-60 overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                                    {results.map((b) => (
                                        <li key={`${b.buyer_type}-${b.id}`}>
                                            <button type="button" onClick={() => pick(b)}
                                                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center justify-between gap-2">
                                                <span className="min-w-0">
                                                    <span className="block text-sm font-semibold truncate">{b.name}</span>
                                                    <span className="block text-xs text-gray-500 truncate">{b.detail}{b.roll_no ? ` · Roll ${b.roll_no}` : ""}</span>
                                                </span>
                                                {b.account ? <StatusPill text={balanceText(b.balance)} tone={balanceTone(b.balance)} /> : <StatusPill text="New account" />}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    ) : (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                            <span className="min-w-0">
                                <span className="block font-semibold truncate">{buyer.name}</span>
                                <span className="block text-xs text-gray-500 truncate">{buyer.detail}</span>
                            </span>
                            <span className="flex items-center gap-2">
                                <StatusPill text={buyer.account ? balanceText(buyer.balance) : "New account"} tone={balanceTone(buyer.balance)} />
                                {!fixedBuyer && <button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={() => setBuyer(null)}>Change</button>}
                            </span>
                        </div>
                    )}
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={6} input={{ id: amountId, name: "amount", label: refund ? "Amount given back (Rs.)" : "Amount paid in (Rs.)", type: "number", required: true }}
                            value={form.amount} onChange={({ value }) => setForm((s) => ({ ...s, amount: value }))} />
                        <SelectInput grid={6} input={{ name: "mode", label: "Mode", options: MODES }} value={form.mode}
                            onChange={({ value }) => setForm((s) => ({ ...s, mode: value }))} />
                        <TextInput grid={6} input={{ name: "date", label: "Date (BS)", mask: "date" }} value={form.date}
                            onChange={({ value }) => setForm((s) => ({ ...s, date: value }))} />
                        <TextInput grid={6} input={{ name: "remarks", label: "Remarks (cheque no., etc.)" }} value={form.remarks}
                            onChange={({ value }) => setForm((s) => ({ ...s, remarks: value }))} />
                    </div>
                </DialogBody>

                <DialogFooter className="app-dialog-foot">
                    {formError &&
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{formError}</span>
                        </p>}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, refund ? "Give back and print" : "Save and print receipt", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default MoneyDialog;
