import { confirmAction } from "@/components/ConfirmDialog";
import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchClasses } from "@/services/functions/classes";
import { __fetch, __save } from "@/services/functions";
import { options as educationLevels } from "@/components/inputs/options/education";
import SMSCreditsView from "../SMSCreditsView";

// manual (admin-only) trigger for the absent SMS.
const ABSENT_SMS_API = "/api/sms/absent";

// education_level value -> readable group heading.
const levelName = educationLevels.reduce((map, o) => {
    map[o.value] = o.name;
    return map;
}, {});

/**
 * "Send Messages" — manual absent-student SMS.
 *
 * Attendance marked by a teacher in the app/web already sends the absent SMS on
 * save, so this page is for attendance captured by RFID/UHF readers, where no one
 * presses save. It lists every class grouped by education level with today's
 * absent count and a Send button per class; clicking it (after a confirm) sends
 * the SAME absent SMS to that class's absent students for today.
 *
 * Classes already messaged today (automatically on save, or by an earlier click
 * here) come back in `already_sent` and are shown as sent, so the school is not
 * charged twice.
 */
function SendMessages() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;

    const [classes, setClasses] = useState([]); // [{ id, name, education_level }]
    const [counts, setCounts] = useState({});    // { class_info_id: absent_count }
    const [sent, setSent] = useState([]);        // class ids already messaged today
    const [date, setDate] = useState("");
    const [sendingId, setSendingId] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    async function load() {
        statusHandler.toggleSearching();
        const raw = await fetchClasses(school); // { id: [name, details, fees_count] }
        const list = Object.entries(raw || {}).map(([id, val]) => ({
            id: Number(id),
            name: val?.[0],
            education_level: val?.[1]?.education_level,
        }));
        setClasses(list);

        await loadCounts();
        statusHandler.toggleSearching();
    }

    // today's absent counts + which classes have already been messaged.
    async function loadCounts() {
        const res = await __fetch(ABSENT_SMS_API, { school });
        setCounts(res?.absent_counts || {});
        setSent((res?.already_sent || []).map(Number));
        setDate(res?.date || "");
    }

    useEffect(() => {
        if (school) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [school]);

    async function sendForClass(cls) {
        const count = counts[cls.id] || 0;
        if (!count) {
            updateNotification(404, `No absent students today in ${cls.name}.`);
            return;
        }
        if (!await confirmAction({
            title: `Send SMS to ${count} absent student${count === 1 ? "" : "s"} of ${cls.name}?`,
            body: `${count} message${count === 1 ? "" : "s"} will be sent and charged against the school's SMS credit. Messages cannot be recalled once sent.`,
            tone: "warning",
            confirmText: "Send messages",
        })) return;

        setSendingId(cls.id);
        const [status, msg] = await __save(ABSENT_SMS_API, {
            school,
            class_info: cls.id,
        });
        updateNotification(status, msg);
        if (status === 200) setSent(prev => [...new Set([...prev, cls.id])]);
        // a refusal is usually "already sent today" (the server keeps that flag),
        // so re-read the authoritative state instead of guessing from the status.
        else await loadCounts();
        setSendingId(null);
    }

    // group classes by education level for the headings.
    const groups = classes.reduce((acc, c) => {
        const key = c.education_level ?? 0;
        (acc[key] = acc[key] || []).push(c);
        return acc;
    }, {});

    return (
        <>
            <SMSCreditsView />
            <div className="border-b border-black mb-2 pb-2">
                <h2 className="text-xl font-semibold leading-7 text-gray-900">Send Messages</h2>
                <p className="mt-1 text-[0.99rem] leading-5 text-gray-600">
                    Send the absent-student SMS for {date ? `today (${date})` : "today"}.
                    Click send on a class to message that class&apos;s absent students.
                    Classes whose attendance was saved from the app are messaged
                    automatically and show as already sent.
                </p>
            </div>

            {searching && <p className="text-gray-600">Loading classes…</p>}
            {!searching && Object.keys(groups).length === 0 &&
                <p className="text-gray-600">No classes found.</p>}

            {Object.entries(groups).map(([level, clsList]) => (
                <div key={level} className="mb-4">
                    <h3 className="text-lg font-semibold capitalize text-gray-800 mb-2">
                        {levelName[level] || "Others"}
                    </h3>
                    <div className="flex flex-col gap-2">
                        {clsList.map(cls => {
                            const count = counts[cls.id] || 0;
                            const alreadySent = sent.includes(cls.id);
                            return (
                                <div key={cls.id}
                                    className="flex items-center justify-between border rounded px-3 py-2">
                                    <span className="capitalize">
                                        {cls.name}
                                        <span className="text-sm text-gray-500"> — {count} absent today</span>
                                        {alreadySent &&
                                            <span className="text-sm text-green-700"> · already sent</span>}
                                    </span>
                                    <Button variant="outlined" size="sm"
                                        disabled={!count || alreadySent || sendingId === cls.id}
                                        onClick={() => sendForClass(cls)}>
                                        {sendingId === cls.id ? "Sending…" : alreadySent ? "Sent" : "Send"}
                                    </Button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </>
    );
}

export default SendMessages;
