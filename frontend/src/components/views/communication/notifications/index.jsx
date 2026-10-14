import { useState } from "react";
import { Button, Textarea, Card } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection } from "@/components/sections";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import AttentionBox from "@/components/AttentionBox";
import classPickerSchema from "@/schemas/class-picker";
import cleanClassInfo from "@/methods/cleanClassInfo";
import { searchStudents } from "@/services/functions/students";
import { fetchStaffs } from "@/services/functions/staffs";
import { __save } from "@/services/functions";

// admin-only push send; backend reaches only the selected users who have a live
// app device token and reports sent/failed (see NOTIFICATIONS.md).
const SEND_NOTIFICATION_API = "/api/v1/notifications/send";

const ROLE_STUDENT = "student";
const ROLE_STAFF = "staff";

const studentSearchSchema = {
    first_name: "", middle_name: "", last_name: "", ...classPickerSchema,
};

/**
 * "Send Notification" — push a title/body to selected students or staff devices.
 *
 * Student recipients are found via the same student search the bulk-SMS page
 * uses (class + optional name filters); staff are loaded as a flat list. Only
 * recipients who have logged into the mobile app have a device token, so the
 * backend silently skips the rest and returns how many were actually reached.
 */
function SendNotification() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;

    const [role, setRole] = useState(ROLE_STUDENT);
    const [studentSearch, setStudentSearch] = useState({ ...studentSearchSchema, school });
    const [recipients, setRecipients] = useState([]);      // [{ id, name }]
    const [selected, setSelected] = useState(() => new Set());
    const [title, setTitle] = useState("");
    const [body, setBody] = useState("");
    const { uploading, searching, statusHandler } = useRequestStatus();

    function setRecipientList(list) {
        setRecipients(list);
        setSelected(new Set(list.map((r) => r.id))); // default: everyone selected
    }

    function switchRole(next) {
        if (next === role) return;
        setRole(next);
        setRecipients([]);
        setSelected(new Set());
    }

    function onStudentFilter({ name, value }) {
        setStudentSearch((state) => ({ ...state, [name]: value }));
    }

    async function loadStudents(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, data] = await searchStudents({
            ...cleanClassInfo(studentSearch),
            school,
            strict: true,
        });
        if (data && data.length > 0) {
            setRecipientList(data.map((s) => ({
                id: s.id,
                name: s.name ||
                    [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" "),
            })));
        } else {
            setRecipientList([]);
            updateNotification(status || 404, msg || "No students found.");
        }
        statusHandler.toggleSearching();
    }

    async function loadStaff() {
        statusHandler.toggleSearching();
        // as_options -> [{ name, value }]; with_accounts_only -> only app-capable staff.
        const data = await fetchStaffs(school, true, true);
        const list = Array.isArray(data) ? data : [];
        if (list.length > 0) {
            setRecipientList(list.map((s) => ({ id: s.value, name: s.name })));
        } else {
            setRecipientList([]);
            updateNotification(404, "No staff found.");
        }
        statusHandler.toggleSearching();
    }

    function toggleOne(id) {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }

    function toggleAll() {
        setSelected((prev) =>
            prev.size === recipients.length ? new Set() : new Set(recipients.map((r) => r.id))
        );
    }

    function reset() {
        setRecipients([]);
        setSelected(new Set());
        setTitle("");
        setBody("");
        setStudentSearch({ ...studentSearchSchema, school });
    }

    async function send(e) {
        e.preventDefault();
        const user_ids = [...selected];
        if (!title.trim() || !body.trim()) {
            updateNotification(400, "Title and message are both required.");
            return;
        }
        if (user_ids.length === 0) {
            updateNotification(400, "Select at least one recipient.");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg, data] = await __save(SEND_NOTIFICATION_API, {
            school,
            recipient_role: role,
            user_ids,
            title: title.trim(),
            body: body.trim(),
        });
        if (status === 200) {
            const sent = data?.sent ?? 0;
            const failed = data?.failed ?? 0;
            updateNotification(200, `Notification sent to ${sent} device(s)` +
                (failed ? `, ${failed} failed.` : "."));
            reset();
        } else {
            updateNotification(status, msg);
        }
        statusHandler.toggleUploading();
    }

    const allSelected = recipients.length > 0 && selected.size === recipients.length;

    return (
        <>
            <div className="border-b border-black mb-3 pb-2">
                <h2 className="text-xl font-semibold leading-7 text-gray-900">Send Notification</h2>
                <p className="mt-1 text-[0.99rem] leading-5 text-gray-600">
                    Push a notification to selected students or staff. Only recipients who
                    have logged into the mobile app will receive it.
                </p>
            </div>

            {/* recipient type */}
            <div className="flex gap-2 mb-3">
                <Button size="sm" variant={role === ROLE_STUDENT ? "filled" : "outlined"}
                    onClick={() => switchRole(ROLE_STUDENT)}>Students</Button>
                <Button size="sm" variant={role === ROLE_STAFF ? "filled" : "outlined"}
                    onClick={() => switchRole(ROLE_STAFF)}>Staff</Button>
            </div>

            {/* recipient pickers */}
            {role === ROLE_STUDENT ? (
                <form className="rounded-md p-3 flex flex-col gap-y-2 w-full" onSubmit={loadStudents}>
                    <FilterSection title={"Student's Info"}>
                        <div className="w-full grid grid-cols-1 sm:grid-cols-12 gap-x-1">
                            <TextInput input={{ name: "first_name", label: "First Name" }} value={studentSearch.first_name} onChange={onStudentFilter} />
                            <TextInput input={{ name: "middle_name", label: "Middle Name" }} value={studentSearch.middle_name} onChange={onStudentFilter} />
                            <TextInput input={{ name: "last_name", label: "Last Name" }} value={studentSearch.last_name} onChange={onStudentFilter} />
                        </div>
                    </FilterSection>
                    <ClassPicker data={studentSearch} onChange={onStudentFilter} classwise={true} />
                    <ButtonsSecion>
                        <Button type="button" variant="outlined" onClick={reset}>Reset</Button>
                        <FormSaveButton isSearch={true} searching={searching} />
                    </ButtonsSecion>
                </form>
            ) : (
                <div className="p-3">
                    <Button variant="outlined" size="sm" disabled={searching} onClick={loadStaff}>
                        {searching ? "Loading…" : "Load staff"}
                    </Button>
                </div>
            )}

            {/* recipients + message */}
            {recipients.length > 0 && (
                <form onSubmit={send}>
                    <AttentionBox title={"Recipients"}
                        description={`${selected.size} of ${recipients.length} selected. Recipients without the app installed won't receive the push.`} />

                    <Card className="px-4 py-3 my-2 max-h-72 overflow-auto">
                        <label className="flex items-center gap-2 font-semibold border-b pb-2 mb-2 cursor-pointer">
                            <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                            Select all
                        </label>
                        <div className="flex flex-col gap-1">
                            {recipients.map((r) => (
                                <label key={r.id} className="flex items-center gap-2 capitalize cursor-pointer">
                                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleOne(r.id)} />
                                    {r.name}
                                </label>
                            ))}
                        </div>
                    </Card>

                    <Card className="px-6 py-3 my-2">
                        <FilterSection title={"Notification"}>
                            <div className="!w-full flex flex-col gap-3">
                                <TextInput input={{ name: "title", label: "Title", maxLength: 120 }}
                                    value={title} onChange={({ value }) => setTitle(value)} />
                                <Textarea value={body} maxLength={500} className="!text-base !text-black"
                                    name="body" label="Message"
                                    onChange={(e) => setBody(e.target.value)} />
                            </div>
                        </FilterSection>
                    </Card>

                    <ButtonsSecion>
                        <FormSaveButton custom={[uploading, "Send notification", "Sending..."]} disabled={uploading} />
                    </ButtonsSecion>
                </form>
            )}
        </>
    );
}

export default SendNotification;
