import { useEffect, useId } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { BuildingOffice2Icon, ExclamationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import Checkbox from "@/components/inputs/Checkbox";
import { PasswordInput, SearchInput, TextInput } from "@/components/inputs";
import { Error } from "@/components/Error";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import useBackdropDismiss from "@/hooks/backdropDismiss";

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

// The four switches share one shape: tick → onChange, leave → onBlur.
function Flag({ name, text, admin, methods }) {
    return (
        <div className="app-dialog-flag sm:col-span-6">
            <Checkbox name={name} checked={admin?.[name]} text={text} onClick={() => {
                methods.onChange({ name, value: !admin?.[name] });
            }} onBlur={() => {
                methods.onBlur({ name, value: !admin?.[name] });
            }} />
        </div>
    );
}

/**
 * Add a school, or edit one — the same form, over the list.
 *
 * Opened by "Add school" above the table and by a row's Edit. Closed by
 * Close, Cancel, a click on the backdrop, and Escape — but Escape belongs to
 * an open picker first. Left to the dialog, one press closed the Economic
 * Year list AND the form under it, with everything typed.
 */
function SchoolFormDialog() {
    const { data: { admin, economicYears, formOpen, formError }, errors, methods, status } = useEnrollmentContext();
    const titleId = useId();
    const aboutId = useId();
    const isEdit = !!admin?.id;
    const { panelRef, outsidePress } = useBackdropDismiss();

    useEffect(() => {
        if (!formOpen) return;
        const onKeyDown = (e) => {
            if (e.key !== 'Escape' || document.querySelector('.app-picker')) return;
            methods.closeForm();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formOpen]);

    return (
        <Dialog ref={panelRef} open={!!formOpen} handler={methods.closeForm} size="lg" dismiss={{ outsidePress, escapeKey: false }}
            aria-labelledby={titleId} className="app-dialog app-dialog-wide">
                <form onSubmit={methods.onSubmit} className="flex min-h-0 flex-1 flex-col">
                    <DialogHeader className="app-dialog-head">
                        <span className="app-dialog-chip" aria-hidden="true">
                            <BuildingOffice2Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1 flex flex-col">
                            <span id={titleId} className="app-dialog-title truncate">
                                {isEdit ? "Edit school" : "Add school"}
                            </span>
                            <span className="app-dialog-sub truncate">
                                {isEdit
                                    ? `${admin?.name || "School"} · School ID ${admin.id}`
                                    : "Registers the school and the account its admin signs in with."}
                            </span>
                        </span>
                        <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full"
                            onClick={methods.closeForm}>
                            <XMarkIcon className="h-5 w-5" />
                        </IconButton>
                    </DialogHeader>

                    <DialogBody className="app-dialog-body flex flex-col gap-y-5">
                        <Group title="School">
                            <TextInput grid={8} value={admin?.name} input={{ name: 'name', label: 'Organization Name' }} {...methods} error={errors?.name} />
                            <TextInput value={admin?.pan_no} input={{ name: 'pan_no', label: 'PAN No.' }} {...methods} error={errors?.pan_no} />
                            <TextInput grid={8} value={admin?.address} input={{ name: 'address', label: 'Address' }} {...methods} error={errors?.address} />
                            <TextInput value={admin?.estd_date} input={{ name: 'estd_date', label: 'ESTD Date. (BS)' }} {...methods} error={errors?.estd_date} />
                            <TextInput grid={12} value={admin?.slogan} input={{ name: 'slogan', label: 'Slogan' }} {...methods} error={errors?.slogan} />
                            <div className="sm:col-span-12">
                                <label htmlFor={aboutId} className="app-field-label text-sm font-medium leading-6 text-gray-900">
                                    About us
                                </label>
                                <textarea id={aboutId} name="about_us" rows={2} value={admin?.about_us ?? ''}
                                    aria-invalid={errors?.about_us ? true : undefined}
                                    className="app-field-shell app-dialog-textarea mt-1 block w-full border border-blue-gray-200 shadow-sm"
                                    onChange={(e) => {
                                        const { name, value } = e.target;
                                        methods.onChange({ name, value });
                                    }} onBlur={(e) => {
                                        const { name, value } = e.target;
                                        methods.onBlur({ name, value });
                                    }} />
                                <Error error={errors?.about_us} />
                            </div>
                        </Group>

                        <Group title="Contact">
                            <TextInput value={admin?.contact} input={{ name: 'contact', label: 'Contact' }} {...methods} error={errors?.contact} />
                            <TextInput value={admin?.telephone} input={{ name: 'telephone', label: 'Telephone' }} {...methods} error={errors?.telephone} />
                            <TextInput value={admin?.email} input={{ name: 'email', label: 'Email', type: 'email' }} {...methods} error={errors?.email} />
                        </Group>

                        <Group title="Licence">
                            <SearchInput input={{ name: 'economic_year', label: "Economic Year", options: economicYears }} value={admin?.economic_year} {...methods} error={errors?.economic_year} />
                            <TextInput value={admin?.renew_date} input={{ name: 'renew_date', label: 'Renew Date' }} {...methods} error={errors?.renew_date} />
                        </Group>

                        <Group title="Admin sign-in">
                            <TextInput value={admin?.username || admin?.account__username} input={{ name: 'username', label: 'Username' }} {...methods} error={errors?.username} />
                            {!isEdit && (
                                <PasswordInput value={admin?.password} input={{ name: 'password', label: 'Password' }} {...methods} error={errors?.password} />
                            )}
                        </Group>

                        <Group title="Options">
                            <Flag name="uses_sms" text="Uses SMS?" admin={admin} methods={methods} />
                            <Flag name="uses_mobile_app" text="Uses mobile app?" admin={admin} methods={methods} />
                            <Flag name="test_account" text="Is this a testing school profile?" admin={admin} methods={methods} />
                            <Flag name="time_set_required" text="Time set required? (attendance in/out cutoff)" admin={admin} methods={methods} />
                        </Group>
                    </DialogBody>

                    <DialogFooter className="app-dialog-foot">
                        {formError &&
                            <p role="alert" className="app-dialog-error">
                                <ExclamationCircleIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                                <span>{formError}</span>
                            </p>}
                        <div className="app-actions app-dialog-actions">
                            <Button variant="text" type="button" onClick={methods.closeForm}>Cancel</Button>
                            <Button variant="outlined" type="button" onClick={methods.resetFormFields}>Reset</Button>
                            <FormSaveButton saving={status?.uploading} isUpdate={isEdit} />
                        </div>
                    </DialogFooter>
                </form>
        </Dialog>
    );
}

export default SchoolFormDialog;
