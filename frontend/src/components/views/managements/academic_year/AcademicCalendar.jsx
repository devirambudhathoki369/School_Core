import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, PaginationSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { getCursor, getURL } from "@/methods/pagination";
import { __delete, __fetch, __save, __update } from "@/services/functions";
import { Textarea, Button, Tooltip } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import Link from "next/link";

const DEFAULT_TYPE = 1;
const calendarEventSchema = {
    start_date: '', end_date: '', type: DEFAULT_TYPE, color: '', description: '', school: '',
};
function AcademicCalendar() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    calendarEventSchema["school"] = user?.profile?.school || user?.profile?.id;
    calendarEventSchema["start_date"] = user?.today;
    calendarEventSchema["end_date"] = user?.today;
    const [form, setForm] = useState({ ...calendarEventSchema });
    const [events, setEvents] = useState({});
    const { fetching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }

    async function saveCalendarEvent(API_PATH, data) {
        if (data?.id) return __update(API_PATH, data);
        return __save(API_PATH, data);
    }

    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg, res] = await saveCalendarEvent(API_PATH, form);
        updateNotification(status, msg);
        if (status === 200) {
            form["type_str"] = EVENT_TYPE_MAPPINGS?.[form?.type];
            if (form?.id) {
                // after update! 
                // color key is used for table row color, so renaming it!
                form["color_code"] = form.color;
                delete form.color;
                setEvents(state => {
                    const ns = { ...state };
                    ns[page]["results"] = [...(ns?.[page]?.results || [])].map(item => item.id === form?.id ? form : item);
                    return ns;
                });
            } else {
                // after new entry!
                setEvents(state => {
                    const ns = { ...state };
                    ns[page]["results"] = [...(state?.[page]?.results || []), form];
                    return ns;
                });
            }
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setForm({ ...calendarEventSchema });
    }
    async function onSelect(action, id, item) {
        if (action === editAction.action) {
            const { color_code: color, ...itemData } = item;
            setForm({ ...calendarEventSchema, color, ...itemData });
        } else if (action === deleteAction.action) {
            const eventId = item?.id;
            const [status, msg,] = await __delete(API_PATH, { id: eventId });
            updateNotification(status, msg);
            setEvents(state => {
                const ns = { ...state };
                ns[page]["results"] = [...(ns?.[page]?.results || [])].filter(item => item.id != eventId);
                return ns;
            });
        }
    }

    // PAGINATION
    const [page, setPage] = useState(1);

    async function getData() {
        const nextURL = getURL(events, page - 1, 'next');
        if (!nextURL && getURL(events, page - 1, 'previous')) {
            setPage(state => state - 1);
            return null;
        }
        const cursor = getCursor(nextURL);
        const schoolId = user?.profile?.school || user?.profile?.id;
        statusHandler.toggleFetching();
        const _events = await __fetch(API_PATH, { school: schoolId, page, cursor });
        if (_events) {
            setEvents(state => ({ ...state, [page]: _events }));
        }
        statusHandler.toggleFetching();
    }
    // 
    useEffect(() => {
        (async () => {
            if (!events?.[page]) await getData();
        })();
    }, [page]);

    return (
        <>
            <ButtonsSecion>
                <Tooltip content="See calendar">
                    <Link href={`#academic-calendar`}>
                        <CalendarDaysIcon className="w-7 h-7 text-green-500" />
                    </Link>
                </Tooltip>
            </ButtonsSecion>
            <form onSubmit={onSave}>
                <Section>
                    <TextInput input={{ name: 'start_date', label: "Start Date (BS)" }} value={form?.start_date}
                        onChange={onChange} />
                    <TextInput input={{ name: 'end_date', label: "End Date (BS)" }} value={form?.end_date}
                        onChange={onChange} />
                    <SelectInput input={{ name: 'type', label: "Event type", options: EVENT_TYPE_OPTIONS }} value={form?.type}
                        onChange={onChange} />
                    <SelectInput input={{ name: 'color', label: "Color", options: EVENT_COLOR_OPTIONS }} value={form?.color}
                        onChange={onChange} />
                    <div className="sm:col-span-8">
                        <Textarea value={form?.description} className="!text-base" name="description" label="Description"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                onChange({ name, value });
                            }} />
                    </div>
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton isUpdate={form?.id} saving={uploading} />
                </ButtonsSecion>
            </form>
            <BasicTable name={"Academic Events"} columns={[
                ["start_date", "Start Date"], ["end_date", "End Date"], ["type_str", "Event Type"], ["description"]
            ]} data={events?.[page]?.results} loading={fetching} actions={[editAction, deleteAction]} onSelect={onSelect}
                footer={
                    <PaginationSection page={page} setPage={setPage} nextPage={getURL(events, page, 'next')} />
                } />
        </>
    )
}

const API_PATH = "/api/calendar_events";
const EVENT_TYPE_OPTIONS = [
    { name: "Public Holiday", value: 1 },
    { name: "Exam", value: 2 },
    { name: "Result", value: 3 },
    { name: "Event Day", value: 4 },
    { name: "Vacation", value: 5 },
];
const EVENT_TYPE_MAPPINGS = EVENT_TYPE_OPTIONS.reduce((acc, option) => {
    acc[option.value] = option.name;
    return acc;
}, {});
const EVENT_COLOR_OPTIONS = [
    { value: "#008000", name: "Green" },
    { value: "#FF0000", name: "Red" },
    { value: "#0000FF", name: "Blue" },
    { value: "#FFFF00", name: "Yellow" },
    { value: "#800080", name: "Purple" },
];

export default AcademicCalendar;