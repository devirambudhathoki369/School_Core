import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, QueueListIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { FOOD_TYPES } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { saveItem } from "@/services/functions/canteen";

const emptyItem = () => ({
    name: "", price: "", category: "", code: "", food_type: 0, is_available: true, order: 0,
    sold_at_counter: true, monthly: false,
});
const formOf = (i) => ({
    name: i.name || "", price: Number(i.price) ? `${Number(i.price)}` : "", category: i.category || "",
    code: i.code || "", food_type: i.food_type || 0, is_available: i.is_available !== false, order: i.order || 0,
    sold_at_counter: i.sold_at_counter !== false, monthly: !!i.monthly,
});

function problemsIn(form) {
    const problems = {};
    if (form.name.trim().length < 2) problems.name = "A name is required.";
    else if (form.name.trim().length > 60) problems.name = "A name holds at most 60 characters.";
    if (!form.sold_at_counter && !form.monthly) problems.sold_at_counter = "Tick at least one: sold at the counter, or billed monthly.";
    if (form.sold_at_counter && !(Number(form.price) > 0)) problems.price = "Enter the counter price.";
    if (`${form.code}`.trim().length > 12) problems.code = "A code holds at most 12 characters.";
    return problems;
}

/**
 * Add an item, or edit one — the same form, over the list (the modal CRUD
 * pattern every register here follows).
 *
 * A changed price applies from the next sale on. Sales already rung up keep
 * the price they were sold at; the note under the field says so.
 */
function ItemFormDialog({ open, item, school, categories, onClose, onSaved }) {
    const isEdit = !!item?.id;
    const [form, setForm] = useState(emptyItem);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const nameId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!open) return;
        setForm(item ? formOf(item) : emptyItem());
        setErrors({});
        setFormError("");
        if (item) return;
        const timer = setTimeout(() => document.getElementById(nameId)?.focus(), 80);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, item]);

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const problems = problemsIn(form);
        setErrors(problems);
        const first = Object.values(problems)[0];
        setFormError(first || "");
        if (first) return;
        setSaving(true);
        const [status, message] = await saveItem({
            ...form, id: item?.id || undefined, school, name: form.name.trim(),
            price: Number(form.price || 0), category: form.category || null, code: form.code.trim() || null,
            food_type: Number(form.food_type || 0), order: Number(form.order || 0),
        });
        setSaving(false);
        if (status === 200) onSaved(isEdit);
        else setFormError(!message || /^(request failed|network error|timeout)/i.test(message)
            ? "The item could not be saved. Nothing was changed; please try again."
            : message);
    }

    const categoryOptions = [{ value: "", name: "No category" }, ...categories.map((c) => ({ value: c.id, name: c.name }))];

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><QueueListIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{isEdit ? "Edit item" : "Add an item"}</span>
                        <span className="app-dialog-sub truncate">
                            {isEdit ? item?.name : "A snack, a drink, a meal — or something billed monthly, like Tiffin or Day care."}
                        </span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>

                <DialogBody className="app-dialog-body">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={8} input={{ id: nameId, name: "name", label: "Name", required: true, placeholder: "e.g. Samosa" }}
                            value={form.name} onChange={onChange} error={errors.name} />
                        <Checkbox name="sold_at_counter" text="Sold at the counter" checked={form.sold_at_counter}
                            description="Sold over the counter at its price — cash, or on the buyer's account."
                            onClick={() => onChange({ name: "sold_at_counter", value: !form.sold_at_counter })} />
                        <Checkbox name="monthly" text="Billed monthly" checked={form.monthly}
                            description="Posted every month to its regular users at their class's rate (set with Class rates)."
                            onClick={() => onChange({ name: "monthly", value: !form.monthly })} />
                        {form.sold_at_counter && (
                            <TextInput input={{ name: "price", label: "Counter price (Rs.)", type: "number", required: true }}
                                value={form.price} onChange={onChange} error={errors.price}
                                info={isEdit ? "Applies from the next sale. Old slips keep the price they were sold at." : null} />
                        )}
                        <SelectInput input={{ name: "category", label: "Category", options: categoryOptions }}
                            value={form.category} onChange={onChange} />
                        <TextInput input={{ name: "code", label: "Counter code", placeholder: "e.g. SAM" }}
                            value={form.code} onChange={onChange} error={errors.code}
                            info="Optional. Typed in the counter's code box for speed." />
                        <SelectInput input={{ name: "food_type", label: "Veg / non-veg", options: FOOD_TYPES }}
                            value={form.food_type} onChange={onChange} />
                        <TextInput input={{ name: "order", label: "Order on the counter", type: "number" }}
                            value={form.order} onChange={onChange} />
                        {form.sold_at_counter && (
                            <Checkbox name="is_available" text="On the counter today" checked={form.is_available}
                                onClick={() => onChange({ name: "is_available", value: !form.is_available })} />
                        )}
                        {form.monthly && (
                            <p className="sm:col-span-12 text-xs text-gray-600">
                                Its monthly rate is set class by class — Class rates, in the item&apos;s row.
                            </p>
                        )}
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
                        <FormSaveButton custom={[saving, isEdit ? "Update item" : "Add item", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default ItemFormDialog;
