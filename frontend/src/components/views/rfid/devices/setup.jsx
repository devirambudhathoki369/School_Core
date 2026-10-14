import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { editAction, customAction } from "@/components/tables/actions";
import { DEVICES_API_PATH, DEVICES_PULL_LOGS_PATH, RFID_STRIP_ZEROS_PATH, RFID_USERS_SYNC_PATH } from "@/components/views/rfid/constants";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import deviceSchema from "@/schemas/rfid/device";
import deviceValidationSchema from "@/schemas/validations/rfid/device";
import { __fetch, __save, __update } from "@/services/functions";
import { fetchSchools } from "@/services/functions/schools";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

// SUPERADMIN ONLY;
function RFIDDeviceSetup() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [devices, setDevices] = useState([]);
    const [form, setForm] = useState({ ...deviceSchema });
    const [errors, setErrors] = useState({});
    const [stripping, setStripping] = useState(false);
    const { fetching, searching, uploading, statusHandler } = useRequestStatus();

    // Superadmin-only: normalize every stored RFID card for the selected school
    // by removing leading zeros (cards were sometimes entered zero-padded but
    // the readers emit plain integers). Covers student/staff profiles + the
    // device-linked copies.
    async function onStripZeros() {
        if (!form?.school) return;
        if (!await confirmAction({
            title: "Strip leading zeros from every RFID card in this school?",
            body: "Every stored card number is rewritten, and readers that were matching on the padded number will stop recognising those cards until they are pushed again. This cannot be undone.",
            tone: "danger",
            confirmText: "Rewrite all cards",
            // A single click is too cheap for an action that rewrites every
            // card row in the school and can take the readers offline.
            requireText: "STRIP",
        })) return;
        setStripping(true);
        const [status, msg] = await __save(RFID_STRIP_ZEROS_PATH, { school: form.school });
        updateNotification(status, msg);
        setStripping(false);
    }

    async function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }

    async function onBlur({ name, value }) {
        try {
            await deviceValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }   
    }

    async function saveDevice(data) {
        // An existing device 
        // has id) is edited via PUT; a new one via POST.
        if (data?.id) return __update(DEVICES_API_PATH, data);
        return __save(DEVICES_API_PATH, data);
    }

    async function onDeviceRegister(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await deviceValidationSchema.validate(form);
            //
            const [status, message, data] = await saveDevice(form);
            updateNotification(status, message);
            if (status === 200) {
                if (form?.id) {
                    // after update — replace the edited row in place;
                    const updated = data?.device || form;
                    setDevices(state => state.map(d => (d.id === form.id ? { ...d, ...updated } : d)));
                } else if (data?.device) {
                    // after entry;
                    setDevices(state => ([data.device, ...state]));
                }
                resetForm();
            }

        } catch ({ message }) {
            updateNotification(400, message);
        }
        statusHandler.toggleUploading();
    }

    // Load a device row into the form for editing. Keep the currently selected
    // school so the devices list (which keys off form.school) doesn't reload.
    async function onSelect(action, _id, item) {
        if (action === editAction.action) {
            setForm(state => ({ ...deviceSchema, ...item, school: state.school }));
        } else if (action === pullLogsAction.action) {
            await onPullLogs(item);
        } else if (action === pushUsersAction.action) {
            await onPushUsers(item);
        }
    }

    // Re-send every user we hold for this device. Enrolment commands are
    // otherwise queued once and never again, so a device that was reset or
    // that refused an enrolment keeps disagreeing with the web forever. Never
    // automatic — a working device gets nothing unless someone presses this.
    async function onPushUsers(item) {
        if (!item?.id) return;
        if (!await confirmAction({
            title: `Push all ${item.registered_users ?? 0} registered user(s) to "${item.serial_number}"?`,
            body: "The device applies them as it polls, so the change is not instant. Existing enrolments on the reader are overwritten.",
            tone: "warning",
            confirmText: "Push users",
        })) return;
        const [status, msg] = await __save(RFID_USERS_SYNC_PATH, { device: item.id, school: form.school });
        updateNotification(status, msg);
    }

    // Ask a device to re-upload the punches it still has stored — recovers logs
    // the server missed while the device was offline. The device acts on it at
    // its next poll; re-ingest is idempotent, so this is safe to repeat.
    async function onPullLogs(item) {
        if (!item?.id) return;
        if (!await confirmAction({
            title: `Ask "${item.serial_number}" to re-upload its stored logs?`,
            body: "Applied on the device's next poll. Punches already recorded are matched, not duplicated.",
            tone: "info",
            confirmText: "Pull logs",
        })) return;
        const [status, msg] = await __save(DEVICES_PULL_LOGS_PATH, { device: item.id, school: form.school });
        updateNotification(status, msg);
    }

    function resetForm() {
        setForm(state => ({ ...deviceSchema, school: state.school }));
    }

    useEffect(() => {
        async function fetchSchoolData() {
            statusHandler.toggleFetching();
            const _schools = await fetchSchools({}, true);
            if (_schools?.length > 0) setSchools(_schools);
            statusHandler.toggleFetching();
        }

        fetchSchoolData();
    }, []);

    useEffect(() => {
        async function searchSchoolDevices(schoolId) {
            statusHandler.toggleSearching();
            const _devices = await __fetch(DEVICES_API_PATH, { school: schoolId });
            if (_devices?.length > 0) setDevices(_devices);
            else {
                setDevices([]);
                updateNotification(404, "No devices registered yet!");
            }
            statusHandler.toggleSearching();
        }

        if (form?.school) searchSchoolDevices(form.school);
    }, [form?.school]);

    return (
        <>
            {fetching ? <Loader /> :
                <>
                    <Section>
                        <SearchInput input={{ name: "school", label: "School", options: schools }} value={form?.school} onChange={onChange} />
                    </Section>

                    {form?.school &&
                        <div className="flex justify-end my-2">
                            <Button variant="outlined" color="red" onClick={onStripZeros} disabled={stripping}>
                                {stripping ? "Removing zeros…" : "Remove leading zeros from all RFID cards"}
                            </Button>
                        </div>
                    }

                    {searching ? <Loader /> :
                        <>
                            <form onSubmit={onDeviceRegister}>
                                {form?.school &&
                                    <>
                                        <Section title={form?.id ? "Edit Device" : "Register New Device"}>
                                            <TextInput value={form?.serial_number} input={{ name: 'serial_number', label: 'Serial No.' }}
                                                onChange={onChange} onBlur={onBlur} error={errors?.serial_number} />
                                            <TextInput value={form?.alias} input={{ name: 'alias', label: 'Alias' }}
                                                onChange={onChange} onBlur={onBlur} error={errors?.alias} />
                                            <TextInput value={form?.ip_address} input={{ name: 'ip_address', label: 'IP Address' }}
                                                onChange={onChange} onBlur={onBlur} error={errors?.ip_address} />
                                            <TextInput value={form?.firmware} input={{ name: 'firmware', label: 'Firmware' }}
                                                onChange={onChange} onBlur={onBlur} error={errors?.firmware} />
                                        </Section>
                                        <ButtonsSecion>
                                            <FormSaveButton saving={uploading} isUpdate={form?.id} disabled={!form?.school || uploading} />
                                        </ButtonsSecion>
                                    </>
                                }
                            </form >
                            {/*  */}
                            {devices?.length ?
                                <BasicTable name={"Devices"} columns={COLS} data={devices.map(decorate)} actions={[editAction, pullLogsAction, pushUsersAction]} onSelect={onSelect} showSelected={false} /> :
                                <></>
                            }
                        </>
                    }
                </>
            }
        </>
    )
}

// Per-row action: queue a "re-upload your stored punches" command to a device.
const pullLogsAction = customAction({ text: "Pull logs", action: "pull_logs", tooltip: "Re-upload stored punches" });
// Per-row action: re-send our enrolled users to a device that has drifted
// out of step with them (reset, swapped, or an enrolment it refused).
const pushUsersAction = customAction({ text: "Push users", action: "push_users", tooltip: "Re-send registered users to this device" });

// A device polls every few seconds; the stored `state` is sticky (set to
// "online" on first contact and never reset), so it can't be trusted. Derive
// the real status from how recently we actually heard from it.
const ONLINE_WINDOW_MS = 180 * 1000;
// Access-control panels (InBio and friends) announce DeviceType=acc. They poll
// getrequest bare, with no INFO= payload, so they never tell us how many users
// they hold — unlike attendance terminals, which report it on every poll.
const DEVICE_TYPE_ACC = 'acc';
function decorate(d) {
    const seen = d?.last_seen ? new Date(d.last_seen) : null;
    const online = seen ? (Date.now() - seen.getTime()) <= ONLINE_WINDOW_MS : false;
    const reportsUsers = (d?.device_type || '').trim().toLowerCase() !== DEVICE_TYPE_ACC;
    return {
        ...d,
        status_str: online ? "Online" : "Offline",
        last_seen_str: seen ? seen.toLocaleString() : "Never",
        // A panel that never reports gets a dash, not a zero: "0" reads as
        // "this device is empty", which is a different — and wrong — claim
        // from "this device doesn't say".
        on_device_str: reportsUsers ? `${d?.user_count ?? 0}` : '—',
    };
}

const COLS = [
    ['serial_number', "Serial No."],
    ['alias', "Alias"],
    ['ip_address', "IP Address"],
    ['last_seen_str', "Last seen"],
    ['status_str', "Status"],
    // Ours first — it's the one that always means something, and it's the
    // number that matches the Registered Users page. The device's own figure
    // sits beside it as a cross-check: where they disagree, a sync didn't land.
    ['registered_users', "Registered users"],
    ['on_device_str', "On device"],
]

export default RFIDDeviceSetup;