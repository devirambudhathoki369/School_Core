import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, UserGroupIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { PARTY_TYPES } from "@/configs/extra_billing";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { saveParty } from "@/services/functions/extra_billing";
import { rs } from "../common";

const emptyParty = () => ({
    name: "", party_type: 1, contact: "", address: "", property_name: "",
    agreement_start: "", agreement_end: "", opening_due: "", remarks: "",
});
const formOf = (p) => ({
    name: p.name || "", party_type: p.party_type || 1, contact: p.contact || "",
    address: p.address || "", property_name: p.property_name || "",
    agreement_start: p.agreement_start || "", agreement_end: p.agreement_end || "",
    opening_due: Number(p.opening_due) ? `${Number(p.opening_due)}` : "", remarks: p.remarks || "",
});

// As wide as the column each one is stored in. A longer value is refused by the
// database, and the answer the office then gets is "Request failed": said here
// instead, under the field, before anything is sent.
const LIMITS = { name: 60, contact: 15, address: 80, property_name: 80 };
const TOO_LONG = {
    name: "A name holds at most 60 characters.",
    contact: "A contact holds at most 15 characters. A second number can go in Remarks.",
    address: "An address holds at most 80 characters.",
    property_name: "A property holds at most 80 characters.",
};
const DATE_FIELDS = ["agreement_start", "agreement_end"];

function problemsIn(form, saved) {
    const problems = {};
    if (form.name.trim().length < 2) problems.name = "A name is required.";
    Object.entries(LIMITS).forEach(([field, most]) => {
        if (`${form[field]}`.trim().length > most) problems[field] = TOO_LONG[field];
    });
    // a date the record already carries is not this edit's business
    DATE_FIELDS.forEach((field) => {
        if (form[field] && form[field] !== (saved?.[field] || "") && !/^\d{4}-\d{2}-\d{2}$/.test(form[field])) {
            problems[field] = "Write the date as YYYY-MM-DD.";
        }
    });
    return problems;
}

// One titled block of the form. `!items-start`: a field with a message under it
// must not push its neighbours' inputs a line up (`.mygrid` bottom-aligns).
function Group({ title, children }) {
    const headingId = useId();
    return (
        <div role="group" aria-labelledby={headingId} className="min-w-0">
            <p id={headingId} className="app-dialog-group">{title}</p>
            <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                {children}
            </div>
        </div>
    );
}

/**
 * Add a party, or edit one — the same form, over the list.
 *
 * Opened by "Add party" above the table and by a row's Edit, so a party found
 * with the table's search is corrected where it was found: the list stays as
 * it was searched and sorted underneath.
 *
 * `party` is the row being edited, or null for a new one; the page leaves it
 * as it is on closing, so the form still reads the same while it fades out.
 * `onSaved` is told what was sent, so the page can compare it with what the
 * server kept.
 */
function PartyFormDialog({ open, party, school, onClose, onSaved }) {
    const isEdit = !!party?.id;
    const [form, setForm] = useState(emptyParty);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const nameId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    // Old dues are history once money has moved: the server keeps the figure
    // it has. The field says so up front instead of taking a number it will
    // then quietly drop.
    const duesFixed = isEdit && (Number(party?.charged) > 0 || Number(party?.paid) > 0);

    useEffect(() => {
        if (!open) return;
        setForm(party ? formOf(party) : emptyParty());
        setErrors({});
        setFormError("");
        // A new party starts at its name. An edit is left where the dialog
        // puts it: a stray key must not land in a name that was right.
        if (party) return;
        const timer = setTimeout(() => document.getElementById(nameId)?.focus(), 80);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, party]);

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const problems = problemsIn(form, party);
        setErrors(problems);
        const first = Object.values(problems)[0];
        setFormError(first || "");
        if (first) return;

        setSaving(true);
        // A blank old dues is zero. Sent as a number: an empty field is dropped
        // from the request, and the server reads a missing figure as "keep it".
        const sent = {
            ...form, id: party?.id || undefined, school,
            name: form.name.trim(), opening_due: Number(form.opening_due || 0),
        };
        const [status, message] = await saveParty({ ...sent });
        setSaving(false);
        if (status === 200) onSaved(sent, !!party?.id);
        // the server's own words when it has any ("Record already exists!");
        // a bare transport error says nothing an office can act on
        else setFormError(!message || /^(request failed|network error|timeout)/i.test(message)
            ? "The party could not be saved. Nothing was changed; please try again."
            : message);
    }

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="lg" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog app-dialog-wide">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true">
                        <UserGroupIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">
                            {isEdit ? "Edit party" : "Add a party"}
                        </span>
                        <span className="app-dialog-sub truncate">
                            {isEdit
                                ? [party?.name, party?.property_name].filter(Boolean).join(" · ")
                                : "Anybody the school bills who is not a student: a tenant, a canteen, an office."}
                        </span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full"
                        onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>

                <DialogBody className="app-dialog-body flex flex-col gap-y-5">
                    <Group title="Party">
                        <TextInput grid={8} input={{ id: nameId, name: "name", label: "Name", required: true }}
                            value={form.name} onChange={onChange} error={errors.name} />
                        <SelectInput input={{ name: "party_type", label: "Type", options: PARTY_TYPES }}
                            value={form.party_type} onChange={onChange} />
                        <TextInput input={{ name: "contact", label: "Contact" }}
                            value={form.contact} onChange={onChange} error={errors.contact} />
                        <TextInput grid={8} input={{ name: "address", label: "Address" }}
                            value={form.address} onChange={onChange} error={errors.address} />
                    </Group>

                    <Group title="Property and agreement">
                        <TextInput input={{ name: "property_name", label: "Property / unit", placeholder: "e.g. Shutter No. 3" }}
                            value={form.property_name} onChange={onChange} error={errors.property_name} />
                        <TextInput input={{ name: "agreement_start", label: "Agreement from (BS)", mask: "date" }}
                            value={form.agreement_start} onChange={onChange} error={errors.agreement_start} />
                        <TextInput input={{ name: "agreement_end", label: "Agreement to (BS)", mask: "date" }}
                            value={form.agreement_end} onChange={onChange} error={errors.agreement_end} />
                    </Group>

                    <Group title="Old dues and remarks">
                        <TextInput
                            input={{
                                name: "opening_due", label: "Old dues (Rs.)",
                                type: duesFixed ? "text" : "number", readOnly: duesFixed,
                            }}
                            value={duesFixed ? rs(party?.opening_due) : form.opening_due} onChange={onChange}
                            info={duesFixed
                                ? "Fixed: this party already has a bill or a receipt."
                                : "What they already owed on the day you entered them. It can be changed until "
                                    + "their first bill or receipt."} />
                        <TextInput grid={8} input={{ name: "remarks", label: "Remarks" }}
                            value={form.remarks} onChange={onChange} />
                    </Group>
                </DialogBody>

                <DialogFooter className="app-dialog-foot">
                    {formError &&
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{formError}</span>
                        </p>}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, isEdit ? "Update party" : "Add party", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default PartyFormDialog;
