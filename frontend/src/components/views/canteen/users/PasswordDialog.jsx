import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, KeyIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput } from "@/components/inputs";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { saveCanteenUser } from "@/services/functions/canteen";
import { passwordProblem } from "./UserFormDialog";

/**
 * A new password for a canteen user who forgot theirs, or one that has to
 * change because someone else learnt it. Every device they are signed in on
 * signs in again with the new one.
 */
function PasswordDialog({ user, school, onClose, onSaved }) {
    const [form, setForm] = useState({ password: "", confirm: "" });
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!user) return;
        setForm({ password: "", confirm: "" });
        setErrors({});
        setFormError("");
    }, [user]);

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const problems = {};
        const weak = passwordProblem(form.password);
        if (weak) problems.password = weak;
        else if (form.password !== form.confirm) problems.confirm = "The two passwords are not the same.";
        setErrors(problems);
        const first = Object.values(problems)[0];
        setFormError(first || "");
        if (first) return;
        setSaving(true);
        const [status, message] = await saveCanteenUser({ school, id: user.id, password: form.password });
        setSaving(false);
        if (status === 200) onSaved(`${user.full_name}'s password changed. They sign in again with the new one.`);
        else setFormError(message || "The password could not be changed. Please try again.");
    }

    return (
        <Dialog ref={panelRef} open={!!user} handler={onClose} size="sm" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><KeyIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">New password</span>
                        <span className="app-dialog-sub truncate">{user ? `${user.full_name} · ${user.username}` : ""}</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <PasswordInput input={{ name: "password", label: "New password", required: true, autoComplete: "new-password" }}
                            value={form.password} onChange={onChange} error={errors.password} />
                        <PasswordInput input={{ name: "confirm", label: "New password again", required: true, autoComplete: "new-password" }}
                            value={form.confirm} onChange={onChange} error={errors.confirm} />
                        <p className="app-field-info sm:col-span-12">
                            6 to 20 characters, with upper and lower case letters, a number and one of @ $ ! % * # ? &amp;.
                            They are signed out on every device.
                        </p>
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
                        <FormSaveButton custom={[saving, "Change password", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default PasswordDialog;
