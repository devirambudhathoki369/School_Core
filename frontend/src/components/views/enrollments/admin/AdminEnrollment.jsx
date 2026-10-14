import { useId } from "react";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput, TextInput } from "@/components/inputs";
import BasicTable from "@/components/tables/BasicTable";
import { editAction, passwordAction, viewAction } from "@/components/tables/actions";
import Badge from "@/components/Badge";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { KeyIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import SchoolFormDialog from "./SchoolFormDialog";
import SchoolDetailsDialog from "./SchoolDetailsDialog";
import useLastValue from "@/hooks/lastValue";
import useBackdropDismiss from "@/hooks/backdropDismiss";

// The school as one cell: its name, where it is, and whether it is a test
// profile — the three things that tell two similar rows apart.
function SchoolCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="flex items-center gap-2 min-w-0">
                <span className="app-cell-text min-w-0 break-words text-blue-gray-900 !font-semibold leading-relaxed">{item?.name}</span>
                {item?.test_account && <Badge tone="warning" dot={false} className="shrink-0">Test</Badge>}
            </span>
            {item?.address &&
                <span className="block break-words text-meta text-[var(--ink-500)]">{item.address}</span>}
        </div>
    );
}

// Every field of a school. All of them are searched and exported; the grid
// draws the first five and leaves the rest to the row's View, so the table
// fits its card instead of scrolling sideways.
const COLUMNS = [
    ['name', null, null, false, null, SchoolCell],
    ['id', "School ID"],
    ['account__username', 'username'],
    ['contact'],
    ['economic_year__name', 'economic year'],
    ['address'],
    ['telephone'],
    ['estd_date', 'estd date'],
    ['pan_no', 'pan no'],
    ['email'],
    ['renew_date', 'renew date'],
    ['slogan'],
    ['uses_mobile_app_str', 'Uses mobile app?'],
    ['time_set_required_str', 'Time set required?'],
    ['test_account_str', 'test account?'],
];
const DETAIL_COLUMNS = COLUMNS.slice(5).map(col => col[0]);

// The school admin's password, changed by the superadmin from the row.
function PasswordDialog() {
    const { data: { newPassword, passwordModalAdmin: opened }, errors, methods, status } = useEnrollmentContext();
    const passwordModalAdmin = useLastValue(opened);
    const passwordTitleId = useId();
    const closePassword = () => methods.setPasswordModalAdmin(null);
    // its own backdrop only: the "Change this password?" confirmation is drawn
    // outside this panel, and answering it must not close what it asks about
    const { panelRef, outsidePress } = useBackdropDismiss();

    return (
        <Dialog ref={panelRef} open={!!opened} handler={closePassword} size="sm" dismiss={{ outsidePress }}
            aria-labelledby={passwordTitleId} className="app-dialog app-dialog-narrow">
            <form onSubmit={methods.handlePasswordChange} className="flex min-h-0 flex-1 flex-col">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true">
                        <KeyIcon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={passwordTitleId} className="app-dialog-title truncate">Change admin password</span>
                        <span className="app-dialog-sub truncate">{passwordModalAdmin?.name}</span>
                    </span>
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full"
                        onClick={closePassword}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>
                <DialogBody className="app-dialog-body flex flex-col gap-y-4">
                    <TextInput value={passwordModalAdmin?.account__username || passwordModalAdmin?.username}
                        input={{ name: 'username', label: 'Username', readOnly: true }} />
                    <PasswordInput value={newPassword?.password} error={errors?.password}
                        onChange={methods.onPasswordChange} onBlur={methods.onPasswordBlur} input={{
                            name: 'password', label: 'New password'
                        }} />
                    <PasswordInput value={newPassword?.confirm_password} error={errors?.confirm_password}
                        onChange={methods.onPasswordChange} onBlur={methods.onPasswordBlur} input={{
                            name: 'confirm_password', label: 'Confirm password'
                        }} />
                </DialogBody>
                <DialogFooter className="app-dialog-foot">
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={closePassword}>
                            Cancel
                        </Button>
                        <FormSaveButton disabled={!methods.hasTypedSamePasswords()} custom={[status?.uploading, "Change password", "Updating..."]} />
                    </div>
                </DialogFooter>
            </form>
        </Dialog>
    );
}

function AdminEnrollment() {
    const { data: { admins }, methods, status } = useEnrollmentContext();

    return (
        <>
            <BasicTable name={"Schools"} columns={COLUMNS} detailColumns={DETAIL_COLUMNS}
                // the row's own View opens the whole record, on every screen
                rowView={false} mobileColumns={['name']} wideColumns={['contact', 'economic_year__name']}
                loading={status?.fetching} data={admins}
                actions={[viewAction, editAction, passwordAction]} onSelect={methods.onActionSelect} showSelected={false}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => methods.openForm()}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add school
                    </Button>
                } />

            <SchoolFormDialog />
            <SchoolDetailsDialog />

            <PasswordDialog />
        </>
    );
}
export default AdminEnrollment;
