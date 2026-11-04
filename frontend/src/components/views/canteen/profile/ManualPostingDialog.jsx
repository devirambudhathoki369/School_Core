import { useEffect, useId, useMemo, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { CalculatorIcon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Loader from "@/components/Loader";
import { MONTHS } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { getManualPosting, runManualPosting } from "@/services/functions/canteen";
import { rs, sumMoney } from "../common";

/**
 * Post by hand to one person: a month the class run missed, a different amount,
 * or a one-off product. A facility cannot be posted twice for one month; the
 * months already posted are marked, and the server refuses them either way.
 */
function ManualPostingDialog({ open, person, school, today, onClose, onPosted }) {
    const [year, setYear] = useState("");
    const [months, setMonths] = useState([]);
    const [date, setDate] = useState(today);
    const [remarks, setRemarks] = useState("");
    const [titles, setTitles] = useState(null);
    const [lines, setLines] = useState([]);
    const [pick, setPick] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!open) return;
        const y = (today || "").slice(0, 4);
        setYear(y);
        setMonths(today ? [Number(today.slice(5, 7))] : []);
        setDate(today);
        setRemarks("");
        setLines([]);
        setPick("");
        setError("");
    }, [open, today]);

    useEffect(() => {
        if (!open || !year) return;
        setTitles(null);
        getManualPosting(school, person.buyer_type, person.id, year).then((data) => {
            setTitles(Array.isArray(data?.titles) ? data.titles : []);
            if (!Array.isArray(data?.titles)) setError(data?.message || "The titles could not be loaded.");
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, year]);

    const byKey = useMemo(() => Object.fromEntries((titles || []).map((t) => [t.key, t])), [titles]);
    const options = [
        { value: "", name: "Pick a title" },
        ...(titles || []).filter((t) => !lines.some((l) => l.key === t.key))
            .map((t) => ({ value: t.key, name: `${t.name} (${t.kind === "facility" ? "facility" : "product"})` })),
    ];
    const postedFor = new Set(lines.flatMap((l) => byKey[l.key]?.posted_months || []));
    const times = months.length || 1;
    const total = sumMoney(lines.map((l) => Number(l.amount || 0) * times));

    function addTitle(key) {
        setPick("");
        if (!key) return;
        const t = byKey[key];
        setLines((list) => [...list, { key, name: t.name, kind: t.kind, amount: Number(t.amount) ? `${Number(t.amount)}` : "" }]);
        setError("");
    }
    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        if (lines.length < 1) return setError("Add at least one title to post.");
        const blank = lines.find((l) => !(Number(l.amount) > 0));
        if (blank) return setError(`${blank.name}: enter an amount.`);
        if (lines.some((l) => l.kind === "facility") && months.length < 1) return setError("Pick the month a facility is posted for.");
        setSaving(true);
        const [status, message, data] = await runManualPosting({
            school, buyer_type: person.buyer_type, buyer: person.id, bs_year: Number(year), months, date: date || undefined,
            remarks: remarks.trim() || undefined, lines: lines.map((l) => ({ key: l.key, amount: l.amount })),
        });
        setSaving(false);
        if (status === 200 && data?.txn) onPosted(message || "Posted.");
        else setError(!message || /^(request failed|network error|timeout)/i.test(message)
            ? "Nothing was posted. Please try again." : message);
    }

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="lg" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog app-dialog-wide">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><CalculatorIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">Post manually</span>
                        <span className="app-dialog-sub truncate">{person.name}{person.detail ? ` · ${person.detail}` : ""}</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body flex flex-col gap-y-4">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={3} input={{ name: "year", label: "Year (BS)", type: "number" }} value={year}
                            onChange={({ value }) => setYear(value)} />
                        <TextInput grid={3} input={{ name: "date", label: "Posting date (BS)", mask: "date" }} value={date}
                            onChange={({ value }) => setDate(value)} />
                        <TextInput grid={6} input={{ name: "remarks", label: "Remark", placeholder: "Optional" }} value={remarks}
                            onChange={({ value }) => setRemarks(value)} />
                    </div>
                    <div>
                        <p className="app-dialog-group">Months</p>
                        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Months">
                            {MONTHS.map((m) => {
                                const on = months.includes(m.value);
                                const posted = postedFor.has(m.value);
                                return (
                                    <button key={m.value} type="button" aria-pressed={on}
                                        title={posted ? "Already posted for a facility picked below" : undefined}
                                        onClick={() => { setMonths((list) => (on ? list.filter((x) => x !== m.value) : [...list, m.value])); setError(""); }}
                                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${on
                                            ? "border-[var(--t-brand-solid,#0f766e)] bg-[var(--t-brand-solid,#0f766e)] text-white"
                                            : posted ? "border-amber-300 bg-amber-50 text-amber-800"
                                                : "border-gray-300 bg-white text-gray-700 hover:border-gray-500"}`}>
                                        {m.name}{posted ? " · posted" : ""}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="mt-1 text-xs text-gray-500">A product can be posted with no month. The amount is per month.</p>
                    </div>
                    <div>
                        <p className="app-dialog-group">What to post</p>
                        {titles === null ? <Loader /> : (
                            <div className="mygrid !items-start !gap-x-5 !gap-y-3">
                                <SelectInput grid={6} input={{ name: "title", label: "Add a title", options }} value={pick}
                                    onChange={({ value }) => addTitle(value)} />
                            </div>
                        )}
                        {lines.length > 0 && (
                            <div className="mt-3 overflow-x-auto rounded-lg border border-gray-200">
                                <table className="w-full text-sm">
                                    <thead className="bg-table-header text-left">
                                        <tr>
                                            <th className="px-3 py-2">Title</th>
                                            <th className="px-3 py-2 text-right w-36">Amount (Rs.)</th>
                                            <th className="px-3 py-2 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((l) => (
                                            <tr key={l.key} className="border-t border-gray-100">
                                                <td className="px-3 py-1.5 font-semibold break-words">{l.name}</td>
                                                <td className="px-3 py-1.5 text-right">
                                                    <input type="number" min="0" step="0.01" aria-label={`Amount for ${l.name}`} value={l.amount}
                                                        onChange={(e) => { const v = e.target.value; setLines((list) => list.map((x) => (x.key === l.key ? { ...x, amount: v } : x))); setError(""); }}
                                                        className="w-28 rounded border border-gray-300 px-2 py-1 text-right" />
                                                </td>
                                                <td className="px-3 py-1.5 text-right">
                                                    <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setLines((list) => list.filter((x) => x.key !== l.key))}
                                                        className="p-1 rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600">
                                                        <XMarkIcon className="h-4 w-4" />
                                                    </button>
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
                        <FormSaveButton custom={[saving, `Post Rs. ${rs(total)}`, "Posting…"]} disabled={lines.length < 1} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default ManualPostingDialog;
