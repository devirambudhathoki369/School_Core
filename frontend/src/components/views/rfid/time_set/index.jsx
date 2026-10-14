import { useEffect, useState } from "react";
import { Button, Typography } from "@material-tailwind/react";
import { TextInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import Loader from "@/components/Loader";
import AttentionBox from "@/components/AttentionBox";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch, __update } from "@/services/functions";

const API_PATH = "/api/attendance/time-set";

// "HH:MM" 24h, 00:00–23:59
function isValidTime(v) {
    return !v || /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

export default function RFIDTimeSet() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const enabledFromProfile = !!user?.profile?.time_set_required;

    const [enabled, setEnabled] = useState(enabledFromProfile);
    const [form, setForm] = useState({ attendance_in_time: "", attendance_out_time: "" });
    const { fetching, uploading, statusHandler } = useRequestStatus();

    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching();
            const data = await __fetch(API_PATH, {});
            if (data) {
                setEnabled(!!data.time_set_required);
                setForm({
                    attendance_in_time: data.attendance_in_time || "",
                    attendance_out_time: data.attendance_out_time || "",
                });
            }
            statusHandler.toggleFetching();
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }

    async function onSave(e) {
        e.preventDefault();
        if (!isValidTime(form.attendance_in_time) || !isValidTime(form.attendance_out_time)) {
            updateNotification(400, "Use 24-hour HH:MM, e.g. 06:00 or 12:00.");
            return;
        }
        statusHandler.toggleUploading();
        const [status, message] = await __update(API_PATH, form);
        updateNotification(status, message);
        statusHandler.toggleUploading();
    }

    if (fetching) return <Loader />;

    if (!enabled) {
        return (
            <AttentionBox
                title="Time Set is not enabled"
                description={`Attendance time set isn't enabled for your school. Ask the superadmin to turn on "Time set required?" in your school profile.`}
                dismissable={false}
            />
        );
    }

    return (
        <form onSubmit={onSave} className="p-3 rounded-md shadow-default flex flex-col gap-y-3">
            <Typography variant="h6" className="text-center">Attendance Time Set</Typography>
            <AttentionBox
                title="How it works"
                description={
                    "In time is a cut-off: a person whose FIRST device punch is after the In time is left ABSENT automatically. " +
                    "Out time is the earliest a punch counts as check-out. Leave a field blank to disable that rule. Use 24-hour HH:MM."
                }
                dismissable={false}
            />
            <Section grid={2}>
                <TextInput value={form.attendance_in_time}
                    input={{ name: "attendance_in_time", label: "In time (HH:MM)", placeholder: "06:00" }}
                    onChange={onChange} />
                <TextInput value={form.attendance_out_time}
                    input={{ name: "attendance_out_time", label: "Out time (HH:MM)", placeholder: "12:00" }}
                    onChange={onChange} />
            </Section>
            <Button type="submit" color="blue-gray" className="mx-auto w-max" disabled={uploading}>
                Save Times
            </Button>
        </form>
    );
}
