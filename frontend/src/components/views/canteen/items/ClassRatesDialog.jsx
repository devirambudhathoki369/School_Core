import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { CalendarDaysIcon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import Loader from "@/components/Loader";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { getClassRates, saveClassRates } from "@/services/functions/canteen";

/**
 * A monthly item's rate, class by class — "Tiffin: Class 1 Rs. 1,500 a month,
 * Class 2 Rs. 2,500". One row per class that has running students (every
 * section and stream of a grade shares its rate). Blank or 0 = not billed for
 * that class. A changed rate applies from the next Monthly Posting; months
 * already posted keep their amount.
 */
function ClassRatesDialog({ item, school, onClose, onSaved }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [all, setAll] = useState("");
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!item) return;
        setRows(null);
        setError("");
        setAll("");
        getClassRates(school, item.id).then((data) => {
            setRows((data?.rows || []).map((r) => ({ ...r, monthly_rate: Number(r.monthly_rate) ? `${Number(r.monthly_rate)}` : "" })));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item]);

    function setRate(key, value) {
        setRows((list) => list.map((r) => (r.key === key ? { ...r, monthly_rate: value } : r)));
        setError("");
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving || !rows) return;
        if (rows.some((r) => r.monthly_rate !== "" && !(Number(r.monthly_rate) >= 0))) return setError("A rate is a number, 0 or more.");
        setSaving(true);
        const [status, message] = await saveClassRates(school, item.id,
            rows.map((r) => ({ key: r.key, label: r.label, monthly_rate: r.monthly_rate === "" ? 0 : Number(r.monthly_rate) })));
        setSaving(false);
        if (status === 200) onSaved(message);
        else setError(message || "The rates could not be saved. Nothing was changed.");
    }

    return (
        <Dialog ref={panelRef} open={!!item} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><CalendarDaysIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{item?.name} — monthly rate by class</span>
                        <span className="app-dialog-sub truncate">What a regular user of each class is posted a month. Blank = not billed.</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body">
                    {rows === null ? <Loader /> : rows.length < 1 ? (
                        <p className="text-sm text-gray-500">No class has running students yet.</p>
                    ) : (
                        <>
                            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                                <span className="text-gray-600">Same rate for every class:</span>
                                <input type="number" min="0" step="0.01" value={all} onChange={(e) => setAll(e.target.value)}
                                    aria-label="Rate for every class" className="w-32 rounded border border-gray-300 px-2 py-1 text-right" />
                                <Button size="sm" variant="outlined" className="normal-case" disabled={all === ""}
                                    onClick={() => setRows((list) => list.map((r) => ({ ...r, monthly_rate: all })))}>Fill all</Button>
                            </div>
                            <div className="overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left">
                                        <tr>
                                            <th className="px-3 py-2">Class</th>
                                            <th className="px-3 py-2 text-right">Students</th>
                                            <th className="px-3 py-2 text-right w-44">Rate a month (Rs.)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((r) => (
                                            <tr key={r.key} className="border-t border-gray-100">
                                                <td className="px-3 py-1.5 font-semibold">{r.label}</td>
                                                <td className="px-3 py-1.5 text-right text-gray-600">{r.students}</td>
                                                <td className="px-3 py-1.5 text-right">
                                                    <input type="number" min="0" step="0.01" value={r.monthly_rate}
                                                        aria-label={`Rate for ${r.label}`} placeholder="not billed"
                                                        onChange={(e) => setRate(r.key, e.target.value)}
                                                        className="w-36 rounded border border-gray-300 px-2 py-1 text-right" />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </DialogBody>
                <DialogFooter className="app-dialog-foot">
                    {error &&
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
                        </p>}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, "Save rates", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default ClassRatesDialog;
