import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, TagIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { PLAN_KINDS, PLAN_MONTHLY } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { savePlan } from "@/services/functions/canteen";

const emptyPlan = () => ({
    name: "", kind: PLAN_MONTHLY, item: "", counter_meals: true, due_limit: "", order: 0, remarks: "",
});
const formOf = (p) => ({
    name: p.name || "", kind: p.kind || PLAN_MONTHLY, item: p.item || "",
    counter_meals: p.counter_meals !== false,
    due_limit: Number(p.due_limit) ? `${Number(p.due_limit)}` : "",
    order: p.order || 0, remarks: p.remarks || "",
});

/**
 * Add a use type, or edit one.
 *
 * MONTHLY types (day care, tiffin monthly) name the item posted every month at
 * the student's class rate. CASH-OR-DUE types carry how much a student on them may take
 * on due. A changed rate is the rate NEW students are put on at — everyone
 * already on the type keeps their own (the note says so).
 */
function PlanFormDialog({ open, plan, school, items = [], onClose, onSaved }) {
    const isEdit = !!plan?.id;
    const [form, setForm] = useState(emptyPlan);
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const nameId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!open) return;
        setForm(plan ? formOf(plan) : emptyPlan());
        setError("");
        if (plan) return;
        const timer = setTimeout(() => document.getElementById(nameId)?.focus(), 80);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, plan]);

    function onChange({ name, value }) {
        setForm((s) => ({ ...s, [name]: value }));
        setError("");
    }

    const monthly = Number(form.kind) === PLAN_MONTHLY;

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        if (form.name.trim().length < 2) return setError("A name is required.");
        if (monthly && !form.item) return setError("Pick the item it posts every month.");
        setSaving(true);
        const [status, message] = await savePlan({
            ...form, id: plan?.id || undefined, school, name: form.name.trim(), kind: Number(form.kind),
            item: monthly ? Number(form.item) : null,
            due_limit: monthly ? 0 : (form.due_limit || 0),
            order: Number(form.order || 0),
        });
        setSaving(false);
        if (status === 200) onSaved(message);
        else setError(message || "The use type could not be saved. Nothing was changed.");
    }

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><TagIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{isEdit ? "Edit use type" : "Add a use type"}</span>
                        <span className="app-dialog-sub truncate">
                            {isEdit ? plan?.name : "How a student uses the canteen: day care, tiffin monthly, tiffin cash or due…"}
                        </span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={8} input={{ id: nameId, name: "name", label: "Name", required: true, placeholder: "e.g. Tiffin monthly" }}
                            value={form.name} onChange={onChange} />
                        <TextInput input={{ name: "order", label: "Order", type: "number" }} value={form.order} onChange={onChange} />
                        <SelectInput grid={8} input={{ name: "kind", label: "How it is paid", options: PLAN_KINDS }}
                            value={form.kind} onChange={({ value }) => onChange({ name: "kind", value: Number(value) })} />
                        {monthly ? (
                            <>
                                <SelectInput grid={8} input={{ name: "item", label: "Item posted every month", required: true,
                                    options: [{ value: "", name: "Pick an item" }, ...items.map((i) => ({ value: i.id, name: i.name }))] }}
                                    value={form.item} onChange={onChange}
                                    info="Charged at the student's class rate for this item (Items & Rates > Class rates)." />
                                <Checkbox name="counter_meals" text="Counter meals are included" checked={form.counter_meals}
                                    description="The counter serves these students without charging, and counts the meals."
                                    onClick={() => onChange({ name: "counter_meals", value: !form.counter_meals })} />
                            </>
                        ) : (
                            <TextInput input={{ name: "due_limit", label: "Due allowed up to (Rs.)", type: "number" }}
                                value={form.due_limit} onChange={onChange}
                                info="How much a student on it may owe the canteen. 0 = cash only. The due is collected in Canteen > Collect & Receipt." />
                        )}
                        <TextInput grid={8} input={{ name: "remarks", label: "Remarks" }} value={form.remarks} onChange={onChange} />
                    </div>
                </DialogBody>
                <DialogFooter className="app-dialog-foot">
                    {error &&
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" /><span>{error}</span>
                        </p>}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, isEdit ? "Update use type" : "Add use type", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default PlanFormDialog;
