import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, QueueListIcon, ScaleIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { saveItem, saveUnit } from "@/services/functions/canteen";

function readable(message, fallback) {
    return !message || /^(request failed|network error|timeout)/i.test(message) ? fallback : message;
}

function Shell({ open, onClose, onSubmit, title, sub, icon: Icon, error, saving, label, children }) {
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();
    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><Icon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{title}</span>
                        <span className="app-dialog-sub truncate">{sub}</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">{children}</div>
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
                        <FormSaveButton custom={[saving, label, "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

/** A product: its name, its unit, a remark, and a price if the counter sells it. */
export function ProductFormDialog({ open, item, units, school, onClose, onSaved }) {
    const [form, setForm] = useState({ name: "", unit: "", remarks: "", price: "" });
    const [errors, setErrors] = useState({});
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const isEdit = !!item;

    useEffect(() => {
        if (!open) return;
        setForm({
            name: item?.name || "", unit: item?.unit || "", remarks: item?.remarks || "",
            price: Number(item?.price) ? `${Number(item.price)}` : "",
        });
        setErrors({});
        setError("");
    }, [open, item]);

    function onChange({ name, value }) {
        setForm((s) => ({ ...s, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }
    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const problems = {};
        const name = form.name.trim();
        if (name.length < 2 || name.length > 60) problems.name = "A product name is 2 to 60 characters.";
        if (!form.unit) problems.unit = units.length ? "Pick a unit." : "Add a unit first, under Units.";
        const price = Number(form.price || 0);
        if (price < 0) problems.price = "A price cannot be below zero.";
        setErrors(problems);
        setError(Object.values(problems)[0] || "");
        if (Object.keys(problems).length) return;
        setSaving(true);
        const [status, message] = await saveItem({
            id: item?.id || undefined, school, name, unit: Number(form.unit), remarks: form.remarks.trim(),
            price, sold_at_counter: price > 0,
        });
        setSaving(false);
        if (status === 200) onSaved(isEdit ? "Product updated!" : "Product added!");
        else setError(readable(message, "The product could not be saved. Nothing was changed; please try again."));
    }
    const options = [{ value: "", name: "Pick a unit" }, ...units.map((u) => ({ value: u.id, name: u.name }))];
    return (
        <Shell open={open} onClose={onClose} onSubmit={onSubmit} icon={QueueListIcon} error={error} saving={saving}
            title={isEdit ? "Edit product" : "Add a product"} sub={isEdit ? item?.name : "Samosa, jerry, juice…"}
            label={isEdit ? "Update product" : "Add product"}>
            <TextInput grid={8} input={{ name: "name", label: "Product name", required: true, placeholder: "e.g. Samosa" }}
                value={form.name} onChange={onChange} error={errors.name} />
            <SelectInput input={{ name: "unit", label: "Unit", required: true, options }}
                value={form.unit} onChange={onChange} error={errors.unit} />
            <TextInput grid={8} input={{ name: "remarks", label: "Remark", placeholder: "Optional" }}
                value={form.remarks} onChange={onChange} />
            <TextInput input={{ name: "price", label: "Counter price (Rs.)", type: "number" }}
                value={form.price} onChange={onChange} error={errors.price}
                info="Leave blank if the counter does not sell it." />
        </Shell>
    );
}

/** A unit: liter, plate, half. */
export function UnitFormDialog({ open, unit, school, onClose, onSaved }) {
    const [name, setName] = useState("");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const isEdit = !!unit;

    useEffect(() => {
        if (!open) return;
        setName(unit?.name || "");
        setError("");
    }, [open, unit]);

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const clean = name.trim();
        if (clean.length < 1 || clean.length > 30) return setError("A unit name is 1 to 30 characters.");
        setSaving(true);
        const [status, message] = await saveUnit({ id: unit?.id || undefined, school, name: clean });
        setSaving(false);
        if (status === 200) onSaved(isEdit ? "Unit updated!" : "Unit added!");
        else setError(readable(message, "The unit could not be saved. Please try again."));
    }
    return (
        <Shell open={open} onClose={onClose} onSubmit={onSubmit} icon={ScaleIcon} error={error} saving={saving}
            title={isEdit ? "Edit unit" : "Add a unit"} sub={isEdit ? unit?.name : "Liter, plate, half…"}
            label={isEdit ? "Update unit" : "Add unit"}>
            <TextInput grid={12} input={{ name: "name", label: "Unit name", required: true, placeholder: "e.g. Plate" }}
                value={name} onChange={({ value }) => { setName(value); setError(""); }} />
        </Shell>
    );
}
