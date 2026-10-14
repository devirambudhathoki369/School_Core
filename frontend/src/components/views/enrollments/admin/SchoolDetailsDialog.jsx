import { useId } from "react";
import { Button, Dialog, DialogBody, DialogFooter, DialogHeader, IconButton } from "@material-tailwind/react";
import { BuildingOffice2Icon, KeyIcon, PencilIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Badge from "@/components/Badge";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import useLastValue from "@/hooks/lastValue";

// A switch reads from its boolean when the row carries one, else from the
// "yes"/"no" text the list sends beside it. `null` = the row does not say.
function flagOf(item, key) {
    if (typeof item?.[key] === 'boolean') return item[key];
    const text = item?.[`${key}_str`];
    if (text === 'yes') return true;
    if (text === 'no') return false;
    return null;
}

function Item({ label, value, wide = false }) {
    const empty = value === undefined || value === null || `${value}`.trim() === '';
    return (
        <div className={`app-record-item ${wide ? 'app-record-wide' : ''}`}>
            <dt className="app-record-label">{label}</dt>
            <dd className={`app-record-value ${empty ? 'is-empty' : ''}`}>{empty ? '—' : value}</dd>
        </div>
    );
}

function Group({ title, children }) {
    return (
        <section className="min-w-0">
            <h3 className="app-dialog-group">{title}</h3>
            {children}
        </section>
    );
}

/**
 * Everything the list knows about one school, opened from a row's View.
 *
 * The table shows the handful of columns that identify a school; the rest of
 * the record is read here instead of in a table that scrolls sideways.
 */
function SchoolDetailsDialog() {
    const { data: { viewedAdmin }, methods } = useEnrollmentContext();
    const school = useLastValue(viewedAdmin);
    const titleId = useId();
    const close = () => methods.setViewedAdmin(null);
    // The list does not send `uses_sms`, so its "no" would be a guess: the SMS
    // line shows only for a row that really carries the value.
    const isTest = flagOf(school, 'test_account');
    const flags = [
        ['Mobile app', flagOf(school, 'uses_mobile_app')],
        ['SMS', typeof school?.uses_sms === 'boolean' ? school.uses_sms : null],
        ['Time set required', flagOf(school, 'time_set_required')],
        ['Testing profile', isTest],
    ].filter(([, on]) => on !== null);

    return (
        <Dialog open={!!viewedAdmin} handler={close} size="lg" aria-labelledby={titleId}
            className="app-dialog app-dialog-wide">
                <DialogHeader className="app-dialog-head">
                    <span className="app-dialog-chip" aria-hidden="true">
                        <BuildingOffice2Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col">
                        <span id={titleId} className="app-dialog-title break-words">{school?.name || 'School'}</span>
                        <span className="app-dialog-sub truncate">
                            {[school?.address, school?.account__username].filter(Boolean).join(' · ')}
                        </span>
                    </span>
                    {isTest && <Badge tone="warning" dot={false} className="shrink-0">Test account</Badge>}
                    <IconButton variant="text" size="sm" aria-label="Close" className="shrink-0 rounded-full" onClick={close}>
                        <XMarkIcon className="h-5 w-5" />
                    </IconButton>
                </DialogHeader>

                <DialogBody className="app-dialog-body flex flex-col gap-y-5">
                    <Group title="School">
                        <dl className="app-record-grid">
                            <Item label="School ID" value={school?.id} />
                            <Item label="PAN No." value={school?.pan_no} />
                            <Item label="ESTD date (BS)" value={school?.estd_date} />
                            <Item label="Address" value={school?.address} wide />
                            <Item label="Slogan" value={school?.slogan} wide />
                            <Item label="About us" value={school?.about_us} wide />
                        </dl>
                    </Group>

                    <Group title="Contact">
                        <dl className="app-record-grid">
                            <Item label="Contact" value={school?.contact} />
                            <Item label="Telephone" value={school?.telephone} />
                            <Item label="Email" value={school?.email} />
                        </dl>
                    </Group>

                    <Group title="Licence and admin sign-in">
                        <dl className="app-record-grid">
                            <Item label="Economic year" value={school?.economic_year__name} />
                            <Item label="Renew date" value={school?.renew_date} />
                            <Item label="Username" value={school?.account__username} />
                        </dl>
                    </Group>

                    {flags.length > 0 &&
                        <Group title="Options">
                            <ul className="flex flex-wrap gap-2">
                                {flags.map(([label, on]) => (
                                    <li key={label} className="app-record-flag">
                                        <span className="app-record-flag-name">{label}</span>
                                        <Badge status={on} dot={false}>{on ? 'Yes' : 'No'}</Badge>
                                    </li>
                                ))}
                            </ul>
                        </Group>}
                </DialogBody>

                <DialogFooter className="app-dialog-foot">
                    <div className="app-actions app-dialog-actions">
                        <Button variant="text" type="button" onClick={close}>Close</Button>
                        <Button variant="outlined" type="button" className="flex items-center justify-center gap-1.5"
                            onClick={() => methods.onActionSelect('change_password', school?.id, school)}>
                            <KeyIcon className="h-4 w-4" aria-hidden="true" /> Password
                        </Button>
                        <Button type="button" color="teal" className="flex items-center justify-center gap-1.5"
                            onClick={() => methods.onActionSelect('edit', school?.id, school)}>
                            <PencilIcon className="h-4 w-4" aria-hidden="true" /> Edit
                        </Button>
                    </div>
                </DialogFooter>
        </Dialog>
    );
}

export default SchoolDetailsDialog;
