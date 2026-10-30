import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { PrinterIcon, TrashIcon, WalletIcon, XMarkIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import Loader from "@/components/Loader";
import { TXN_REFUND, TXN_TOPUP } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { getAccount, saveAccount, voidOfficeReceipt } from "@/services/functions/canteen";
import { StatusPill, balanceText, balanceTone, rs } from "../common";

/**
 * One account: what it holds, every movement on it with the running balance,
 * and its own rules — limits that differ from the school's, a lost card
 * blocked, a note the counter shows (allergies, "lunch only").
 */
function AccountDialog({ accountId, school, settings, onClose, onChanged, onTopUp, onRefund, onPrintReceipt, updateNotification }) {
    const [data, setData] = useState(null);
    const [form, setForm] = useState({ daily_limit: "", credit_limit: "", is_blocked: false, block_reason: "", notes: "" });
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    async function load() {
        if (!accountId) return;
        const res = await getAccount(school, accountId);
        if (!res?.id) return;
        setData(res);
        setForm({
            daily_limit: res.own_daily_limit === null || res.own_daily_limit === undefined ? "" : `${Number(res.own_daily_limit)}`,
            credit_limit: res.own_credit_limit === null || res.own_credit_limit === undefined ? "" : `${Number(res.own_credit_limit)}`,
            is_blocked: !!res.is_blocked, block_reason: res.block_reason || "", notes: res.notes || "",
        });
    }
    useEffect(() => { setData(null); load(); /* eslint-disable-next-line */ }, [accountId]);

    async function onSave(e) {
        e.preventDefault();
        if (saving) return;
        setSaving(true);
        const [status, message] = await saveAccount({
            school, id: accountId,
            daily_limit: form.daily_limit === "" ? "" : Number(form.daily_limit),
            credit_limit: form.credit_limit === "" ? "" : Number(form.credit_limit),
            is_blocked: form.is_blocked, block_reason: form.block_reason, notes: form.notes,
        });
        setSaving(false);
        updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Saved!" : "Failed."));
        if (status === 200) { load(); onChanged(); }
    }

    async function onVoid(row) {
        const ok = await confirmAction({
            title: `Void receipt C-${row.receipt_no}?`, confirmText: "Void receipt",
            body: "It stops counting at once and stays on the record with its number, which is never reused.",
        });
        if (!ok) return;
        const [status, message] = await voidOfficeReceipt(school, row.id, "voided from the account");
        updateNotification(status === 200 ? 200 : 400, message || "Failed.");
        if (status === 200) { load(); onChanged(); }
    }

    const open = !!accountId;
    return (
        <Dialog ref={panelRef} open={open} handler={onClose} size="xl" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog app-dialog-wide">
            <DialogHeader className="app-dialog-head">
                <span className="app-dialog-chip" aria-hidden="true"><WalletIcon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1 flex flex-col">
                    <span id={titleId} className="app-dialog-title truncate">{data?.name || "Canteen account"}</span>
                    <span className="app-dialog-sub truncate">{data ? `${data.buyer_type_name} · ${data.detail || ""}` : ""}</span>
                </span>
                <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                    <XMarkIcon className="h-5 w-5" />
                </IconButton>
            </DialogHeader>
            <DialogBody className="app-dialog-body flex flex-col gap-y-4">
                {!data ? <Loader /> : (
                    <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <Fact label="Balance" value={balanceText(data.balance)} tone={balanceTone(data.balance)} />
                            <Fact label="Can spend now" value={`Rs. ${rs(data.available)}`} />
                            <Fact label="Daily limit" value={Number(data.daily_limit) > 0 ? `Rs. ${rs(data.daily_limit)}` : "None"}
                                hint={data.own_daily_limit === null ? "school default" : "this account"} />
                            <Fact label="Credit allowed" value={Number(data.credit_limit) > 0 ? `Rs. ${rs(data.credit_limit)}` : "Prepaid only"}
                                hint={data.own_credit_limit === null ? "school default" : "this account"} />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button size="sm" color="teal" className="normal-case" onClick={() => onTopUp(data)}>Top up</Button>
                            <Button size="sm" variant="outlined" className="normal-case" disabled={!(Number(data.balance) > 0)}
                                onClick={() => onRefund(data)}>Give back money</Button>
                        </div>

                        <form onSubmit={onSave} className="rounded-lg border border-gray-200 p-3">
                            <p className="app-dialog-group">This account&apos;s rules</p>
                            <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                                <TextInput input={{ name: "daily_limit", label: "Daily limit (Rs.)", type: "number",
                                    placeholder: `School default: ${Number(settings?.daily_limit) > 0 ? rs(settings.daily_limit) : "none"}` }}
                                    value={form.daily_limit} onChange={({ value }) => setForm((s) => ({ ...s, daily_limit: value }))}
                                    info="Blank = the school's default. 0 = no daily limit." />
                                <TextInput input={{ name: "credit_limit", label: "Credit allowed (Rs.)", type: "number",
                                    placeholder: `School default: ${Number(settings?.credit_limit) > 0 ? rs(settings.credit_limit) : "prepaid only"}` }}
                                    value={form.credit_limit} onChange={({ value }) => setForm((s) => ({ ...s, credit_limit: value }))}
                                    info="How far below zero it may go. Blank = the school's default." />
                                <TextInput input={{ name: "notes", label: "Note shown at the counter", placeholder: "e.g. allergic to peanuts" }}
                                    value={form.notes} onChange={({ value }) => setForm((s) => ({ ...s, notes: value }))} />
                                <Checkbox name="is_blocked" text="Card blocked (lost or misused)" checked={form.is_blocked}
                                    onClick={() => setForm((s) => ({ ...s, is_blocked: !s.is_blocked }))} />
                                {form.is_blocked && (
                                    <TextInput grid={8} input={{ name: "block_reason", label: "Why it is blocked" }}
                                        value={form.block_reason} onChange={({ value }) => setForm((s) => ({ ...s, block_reason: value }))} />
                                )}
                            </div>
                            <div className="mt-3 flex justify-center">
                                <Button type="submit" variant="outlined" disabled={saving}>{saving ? "Saving…" : "Save rules"}</Button>
                            </div>
                        </form>

                        <div>
                            <p className="app-dialog-group">Statement</p>
                            {data.statement.length < 1 ? <p className="text-sm text-gray-500">Nothing on this account yet.</p> : (
                                <div className="overflow-x-auto rounded-lg border border-gray-200">
                                    <table className="w-full text-sm">
                                        <thead className="bg-table-header text-left">
                                            <tr>
                                                <th className="px-3 py-2">Date</th>
                                                <th className="px-3 py-2">What</th>
                                                <th className="px-3 py-2 text-right">Amount</th>
                                                <th className="px-3 py-2 text-right">Balance</th>
                                                <th className="px-3 py-2 hidden sm:table-cell">By</th>
                                                <th className="px-3 py-2 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.statement.map((row) => {
                                                const office = row.kind === TXN_TOPUP || row.kind === TXN_REFUND;
                                                return (
                                                    <tr key={row.id} className={`border-t border-gray-100 ${row.is_active ? "" : "opacity-50"}`}>
                                                        <td className="px-3 py-1.5 whitespace-nowrap">{row.date}<span className="block text-xs text-gray-500">{row.time}</span></td>
                                                        <td className="px-3 py-1.5">
                                                            {row.kind_name}
                                                            {row.receipt_no ? ` · C-${row.receipt_no}` : ""}
                                                            {row.sale_no ? ` · sale ${row.sale_no}` : ""}
                                                            {office && row.mode_name ? <span className="text-xs text-gray-500 capitalize"> · {row.mode_name}</span> : null}
                                                            {(row.lines || []).length > 0 && (
                                                                <span className="block text-xs text-gray-500">
                                                                    {row.lines.map((l) => `${l.name} ${rs(l.amount)}`).join(", ")}
                                                                    {(row.months || []).length > 0 ? ` · ${row.months.join(", ")}` : ""}
                                                                </span>
                                                            )}
                                                            {!row.is_active && <> <StatusPill text="Voided" tone="red" /></>}
                                                        </td>
                                                        <td className={`px-3 py-1.5 text-right tabular-nums font-semibold ${Number(row.amount) < 0 ? "text-rose-700" : "text-green-700"}`}>
                                                            {Number(row.amount) < 0 ? "−" : "+"}{rs(Math.abs(row.amount))}
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right tabular-nums">{rs(row.running)}</td>
                                                        <td className="px-3 py-1.5 hidden sm:table-cell">{row.entered_by}</td>
                                                        <td className="px-3 py-1.5">
                                                            {office && (
                                                                <div className="flex items-center justify-end gap-x-1">
                                                                    <button type="button" aria-label={`Print receipt C-${row.receipt_no}`} onClick={() => onPrintReceipt(row.id)}
                                                                        className="p-1.5 rounded bg-teal-50 text-teal-700"><PrinterIcon className="w-4 h-4" /></button>
                                                                    {row.is_active && (
                                                                        <button type="button" aria-label={`Void receipt C-${row.receipt_no}`} onClick={() => onVoid(row)}
                                                                            className="p-1.5 rounded bg-rose-50 text-rose-600"><TrashIcon className="w-4 h-4" /></button>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </DialogBody>
            <DialogFooter className="app-dialog-foot">
                <div className="app-actions app-dialog-actions">
                    <Button variant="text" type="button" onClick={onClose}>Close</Button>
                </div>
            </DialogFooter>
        </Dialog>
    );
}

const TONES = {
    green: "text-green-700", red: "text-rose-700", gray: "text-gray-900",
};
function Fact({ label, value, hint, tone = "gray" }) {
    return (
        <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
            <p className={`text-sm font-bold tabular-nums truncate ${TONES[tone] || TONES.gray}`}>{value}</p>
            {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
        </div>
    );
}

export default AccountDialog;
