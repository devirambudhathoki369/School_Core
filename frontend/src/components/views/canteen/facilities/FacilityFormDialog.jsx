import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, TagIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import Loader from "@/components/Loader";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { getClasses, saveFacility } from "@/services/functions/canteen";

/**
 * A facility and the classes it is for, each with its amount a month:
 * "Day care — Nursery Rs. 1,500, One Rs. 2,000". A class is chosen by ticking it.
 */
function FacilityFormDialog({ open, facility, school, onClose, onSaved }) {
    const [form, setForm] = useState({ name: "", remarks: "", counter_meals: false });
    const [rows, setRows] = useState(null);
    const [all, setAll] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();
    const isEdit = !!facility;

    useEffect(() => {
        if (!open) return;
        setForm({ name: facility?.name || "", remarks: facility?.remarks || "", counter_meals: !!facility?.counter_meals });
        setError("");
        setAll("");
        setRows(null);
        getClasses(school).then((classes) => {
            const chosen = Object.fromEntries((facility?.classes || []).map((c) => [c.key, c]));
            const list = classes.map((c) => ({
                key: c.key, label: c.label, students: c.students, on: !!chosen[c.key],
                amount: chosen[c.key] ? `${Number(chosen[c.key].amount)}` : "",
            }));
            // A class set up here that has no running students today still shows.
            (facility?.classes || []).forEach((c) => {
                if (!list.some((r) => r.key === c.key)) {
                    list.push({ key: c.key, label: c.label, students: 0, on: true, amount: `${Number(c.amount)}` });
                }
            });
            setRows(list);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, facility]);

    function setRow(key, patch) {
        setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
        setError("");
    }
    const ticked = (rows || []).filter((r) => r.on);
    const allOn = rows?.length > 0 && ticked.length === rows.length;

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const name = form.name.trim();
        if (name.length < 2 || name.length > 60) return setError("A facility's name is 2 to 60 characters.");
        if (ticked.length < 1) return setError("Tick at least one class.");
        const blank = ticked.find((r) => !(Number(r.amount) > 0));
        if (blank) return setError(`${blank.label}: enter its amount.`);
        setSaving(true);
        const [status, message] = await saveFacility({
            id: facility?.id || undefined, school, name, remarks: form.remarks.trim(), counter_meals: form.counter_meals,
            classes: ticked.map((r) => ({ key: r.key, label: r.label, amount: r.amount })),
        });
        setSaving(false);
        if (status === 200) onSaved(message || "Saved!");
        else setError(!message || /^(request failed|network error|timeout)/i.test(message)
            ? "The facility could not be saved. Nothing was changed; please try again." : message);
    }

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="lg" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog app-dialog-wide">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><TagIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{isEdit ? "Edit facility" : "Add a facility"}</span>
                        <span className="app-dialog-sub truncate">{isEdit ? facility?.name : "Day care, tiffin monthly…"}</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body flex flex-col gap-y-4">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={6} input={{ name: "name", label: "Facility name", required: true, placeholder: "e.g. Day care" }}
                            value={form.name} onChange={({ value }) => { setForm((s) => ({ ...s, name: value })); setError(""); }} />
                        <TextInput grid={6} input={{ name: "remarks", label: "Remark", placeholder: "Optional" }}
                            value={form.remarks} onChange={({ value }) => setForm((s) => ({ ...s, remarks: value }))} />
                        <div className="sm:col-span-12">
                            <Checkbox name="counter_meals" text="Covers meals at the counter" checked={form.counter_meals}
                                description="Tick for something like tiffin monthly: the counter serves these students without charging."
                                onClick={() => setForm((s) => ({ ...s, counter_meals: !s.counter_meals }))} />
                        </div>
                    </div>
                    <div>
                        <div className="flex flex-wrap items-end justify-between gap-2 mb-2">
                            <p className="app-dialog-group !mb-0">Classes and amounts a month</p>
                            <div className="flex items-center gap-2">
                                <input type="number" min="0" step="0.01" value={all} onChange={(e) => setAll(e.target.value)}
                                    aria-label="Same amount for every class ticked" placeholder="Same amount"
                                    className="w-28 rounded border border-gray-300 px-2 py-1 text-sm text-right" />
                                <Button size="sm" variant="outlined" type="button" className="normal-case" disabled={!all || ticked.length < 1}
                                    onClick={() => setRows((list) => list.map((r) => (r.on ? { ...r, amount: all } : r)))}>
                                    Apply to ticked
                                </Button>
                            </div>
                        </div>
                        {rows === null ? <Loader /> : rows.length < 1 ? (
                            <p className="text-sm text-gray-500">This school has no classes with running students yet.</p>
                        ) : (
                            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2 w-10">
                                                <input type="checkbox" aria-label="Tick every class" className="accent-teal-600" checked={allOn}
                                                    onChange={() => setRows((list) => list.map((r) => ({ ...r, on: !allOn })))} />
                                            </th>
                                            <th className="px-3 py-2">Class</th>
                                            <th className="px-3 py-2 text-right hidden sm:table-cell">Students</th>
                                            <th className="px-3 py-2 text-right w-40">Amount (Rs.)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r) => (
                                            <tr key={r.key} className="border-t border-gray-100">
                                                <td className="px-3 py-1.5">
                                                    <input type="checkbox" aria-label={`Tick ${r.label}`} className="accent-teal-600" checked={r.on}
                                                        onChange={() => setRow(r.key, { on: !r.on })} />
                                                </td>
                                                <td className="px-3 py-1.5 font-semibold break-words">{r.label}</td>
                                                <td className="px-3 py-1.5 text-right tabular-nums hidden sm:table-cell">{r.students}</td>
                                                <td className="px-3 py-1.5 text-right">
                                                    <input type="number" min="0" step="0.01" aria-label={`Amount for ${r.label}`} disabled={!r.on}
                                                        value={r.amount} onChange={(e) => setRow(r.key, { amount: e.target.value })}
                                                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right disabled:bg-gray-50" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </DialogBody>
                <DialogFooter className="app-dialog-foot">
                    {error && (
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{error}</span>
                        </p>
                    )}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, isEdit ? "Update facility" : "Add facility", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default FacilityFormDialog;
