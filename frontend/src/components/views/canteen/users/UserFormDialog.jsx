import { useEffect, useId, useState } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { ExclamationCircleIcon, UserPlusIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput, TextInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { CANTEEN_PAGES } from "@/configs/canteen";
import useBackdropDismiss from "@/hooks/backdropDismiss";
import { saveCanteenUser } from "@/services/functions/canteen";

const USERNAME = /^[\w.@+-]{6,25}$/;

/** The portal's password rule (the server checks the same). */
export function passwordProblem(password) {
    if (!password) return "Enter a password.";
    if (password.length < 6 || password.length > 20) return "A password holds 6 to 20 characters.";
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return "Use upper and lower case letters.";
    if (!/[0-9]/.test(password)) return "Use at least one number.";
    if (!/[@$!%*#?&]/.test(password)) return "Use one of @ $ ! % * # ? &.";
    return null;
}

const emptyUser = () => ({ full_name: "", contact: "", username: "", password: "", confirm: "", permissions: [] });
const formOf = (u) => ({
    full_name: u.full_name || "", contact: u.contact || "", username: u.username || "",
    password: "", confirm: "", permissions: [...(u.permissions || [])],
});

function problemsIn(form, isEdit) {
    const problems = {};
    if (form.full_name.trim().length < 2) problems.full_name = "Write the person's name.";
    if (!isEdit) {
        if (!USERNAME.test(form.username.trim())) problems.username = "6 to 25 letters or digits (and . @ + - _ only).";
        const weak = passwordProblem(form.password);
        if (weak) problems.password = weak;
        else if (form.password !== form.confirm) problems.confirm = "The two passwords are not the same.";
    }
    if (form.permissions.length < 1) problems.permissions = "Tick at least one page.";
    return problems;
}

/**
 * Add a canteen user, or change one — the name, the phone, and the pages they
 * may open. A password is set here when the user is added; afterwards it is
 * reset from the list (Password), which also signs them out everywhere.
 *
 * `grantable` is the pages the person at the keyboard may give: all of them
 * for the school's office, only their own for anyone else.
 */
function UserFormDialog({ open, user, school, grantable, onClose, onSaved }) {
    const isEdit = !!user?.id;
    const [form, setForm] = useState(emptyUser);
    const [errors, setErrors] = useState({});
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const titleId = useId();
    const nameId = useId();
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!open) return;
        setForm(user ? formOf(user) : emptyUser());
        setErrors({});
        setFormError("");
        if (user) return;
        const timer = setTimeout(() => document.getElementById(nameId)?.focus(), 80);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, user]);

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }
    function togglePage(value) {
        const on = form.permissions.includes(value);
        onChange({ name: "permissions", value: on ? form.permissions.filter((p) => p !== value) : [...form.permissions, value] });
    }

    async function onSubmit(e) {
        e.preventDefault();
        if (saving) return;
        const problems = problemsIn(form, isEdit);
        setErrors(problems);
        const first = Object.values(problems)[0];
        setFormError(first || "");
        if (first) return;
        setSaving(true);
        const data = {
            school, full_name: form.full_name.trim(), contact: form.contact.trim(),
            permissions: CANTEEN_PAGES.map((p) => p.value).filter((v) => form.permissions.includes(v)),
        };
        const [status, message] = await saveCanteenUser(isEdit
            ? { ...data, id: user.id }
            : { ...data, username: form.username.trim(), password: form.password });
        setSaving(false);
        if (status === 200) onSaved(message);
        else setFormError(!message || /^(request failed|network error|timeout)/i.test(message)
            ? "The canteen user could not be saved. Nothing was changed; please try again."
            : message);
    }

    const allowed = new Set(grantable);

    return (
        <Dialog ref={panelRef} open={!!open} handler={onClose} size="md" dismiss={{ outsidePress }}
            aria-labelledby={titleId} className="app-dialog">
            <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true"><UserPlusIcon className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title truncate">{isEdit ? "Edit canteen user" : "Add a canteen user"}</span>
                        <span className="app-dialog-sub truncate">
                            {isEdit ? `${user?.full_name} · ${user?.username}` : "Signs in at /canteen and sees the canteen only."}
                        </span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={onClose}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>

                <DialogBody className="app-dialog-body">
                    <div className="mygrid !items-start !gap-x-5 !gap-y-4">
                        <TextInput grid={8} input={{ id: nameId, name: "full_name", label: "Name", required: true, placeholder: "e.g. Sita Thapa" }}
                            value={form.full_name} onChange={onChange} error={errors.full_name} />
                        <TextInput input={{ name: "contact", label: "Phone", placeholder: "optional" }}
                            value={form.contact} onChange={onChange} />
                        {!isEdit && (
                            <>
                                <TextInput input={{ name: "username", label: "Username", required: true, placeholder: "e.g. counter.sita", autoComplete: "off" }}
                                    value={form.username} onChange={onChange} error={errors.username}
                                    info="6 to 25 characters. Used to sign in; it cannot be changed later." />
                                <PasswordInput input={{ name: "password", label: "Password", required: true, autoComplete: "new-password" }}
                                    value={form.password} onChange={onChange} error={errors.password} />
                                <PasswordInput input={{ name: "confirm", label: "Password again", required: true, autoComplete: "new-password" }}
                                    value={form.confirm} onChange={onChange} error={errors.confirm} />
                                <p className="app-field-info sm:col-span-12">
                                    6 to 20 characters, with upper and lower case letters, a number and one of @ $ ! % * # ? &amp;.
                                </p>
                            </>
                        )}
                    </div>

                    <fieldset className="mt-5">
                        <legend className="text-sm font-semibold text-blue-gray-900">Pages this person may open</legend>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs">
                            <button type="button" className="rounded-full border border-gray-300 px-2.5 py-1 hover:bg-gray-50"
                                onClick={() => onChange({ name: "permissions", value: allowed.has(CANTEEN_PAGES[0].value) ? [CANTEEN_PAGES[0].value] : [] })}>
                                Counter only
                            </button>
                            <button type="button" className="rounded-full border border-gray-300 px-2.5 py-1 hover:bg-gray-50"
                                onClick={() => onChange({ name: "permissions", value: CANTEEN_PAGES.map((p) => p.value).filter((v) => allowed.has(v)) })}>
                                Every page
                            </button>
                        </div>
                        <div className="mygrid !items-start !gap-x-5 !gap-y-1 mt-2">
                            {CANTEEN_PAGES.map((page) => (
                                <Checkbox key={page.value} name={`page-${page.value}`} text={page.name}
                                    description={allowed.has(page.value) ? page.hint : "You do not have this page, so you cannot give it."}
                                    checked={form.permissions.includes(page.value)} disabled={!allowed.has(page.value)}
                                    onClick={() => togglePage(page.value)} />
                            ))}
                        </div>
                    </fieldset>
                </DialogBody>

                <DialogFooter className="app-dialog-foot">
                    {formError &&
                        <p role="alert" className="app-dialog-error">
                            <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                            <span>{formError}</span>
                        </p>}
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={onClose}>Cancel</Button>
                        <FormSaveButton custom={[saving, isEdit ? "Save changes" : "Add canteen user", "Saving…"]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

export default UserFormDialog;
