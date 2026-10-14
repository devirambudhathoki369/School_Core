import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { toggleAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch, __save } from "@/services/functions";
import { useEffect, useState } from "react";

const STAFF_ATTENDANCE_API = "/api/attendance/staff";
const _toggleAction = toggleAction("Attend?", "Click to toggle attendance status.");

const inputSchema = { school: '', date: '' };
function StaffAttendanceEntry() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    inputSchema["school"] = user?.profile?.school || user?.profile?.id;
    inputSchema["date"] = user?.today;
    const [input, setInput] = useState({ ...inputSchema });
    const [data, setData] = useState([]);
    const [alreadyExists, setAlreadyExists] = useState(false);
    const { searching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    function getAttendanceRow(rep) {
        if (rep?.status !== undefined) {
            rep["status_str"] = rep.status === true ? "present" : "absent";
            rep["color"] = rep.status === true ? "green" : "red";
        }
        return rep;
    }
    async function loadStaffs() {
        if (!input?.school || !input?.date) return;
        statusHandler.toggleSearching();
        const res = await __fetch(STAFF_ATTENDANCE_API, {
            school: input.school,
            date: input.date,
        });
        if (res?.attendances?.length > 0) {
            setAlreadyExists(!!res.exists);
            setData(res.attendances.reduce((acc, row, index) => {
                row["index"] = index;
                if (row?.status === undefined || row?.status === null) row["status"] = true;
                row = getAttendanceRow(row);
                acc.push(row);
                return acc;
            }, []));
        } else {
            setAlreadyExists(false);
            setData([]);
            updateNotification(404, "No employed staff found.");
        }
        statusHandler.toggleSearching();
    }
    useEffect(() => {
        if (input?.school && input?.date) loadStaffs();
    }, [input?.date]);

    function onAttendanceChange(index, name, value) {
        setData(state => {
            const _s = [...state];
            _s[index][name] = value;
            return _s;
        });
    }
    function onAttend(action, id, item) {
        const { index } = item;
        setData(state => {
            const _s = [...state];
            let updated = { ...item, status: !item?.status, reason: item?.reason || '' };
            updated = getAttendanceRow(updated);
            _s[index] = updated;
            return _s;
        });
    }
    function prepareData() {
        return {
            school: input.school,
            date: input.date,
            attendances: data.map(({ staff, status, reason }) => ({ staff, status, reason })),
        };
    }
    async function onSave(e) {
        e.preventDefault();
        if (alreadyExists) {
            updateNotification(409, "Attendance for this date already exists — use management to edit.");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg,] = await __save(STAFF_ATTENDANCE_API, prepareData(), false);
        updateNotification(status, msg);
        if (status === 200) {
            await loadStaffs();
        }
        statusHandler.toggleUploading();
    }
    function disableSave() {
        return !input?.date || alreadyExists || data.length === 0;
    }
    return (
        <>
            <form onSubmit={onSave}>
                <BasicTable name={"Staff Attendance entry"} data={data || []} columns={[
                    ['name', 'Staff name'], ['status_str', "Status"], ['reason', "Absent Reason"]
                ]} loading={searching}
                    editable={uploading ? false : true} editableColumns={[['reason']]}
                    actions={[_toggleAction]} showSelected={false}
                    onChange={onAttendanceChange} onSelect={onAttend}
                    header={
                        <>
                            <Section>
                                <TextInput input={{ name: 'date', label: "Date" }} value={input?.date} onChange={onChange} />
                            </Section>
                            {alreadyExists &&
                                <div className="bg-amber-50 text-amber-900 border border-amber-200 rounded-md p-2 m-1 text-sm">
                                    Attendance for <strong>{input?.date}</strong> already exists. Go to <em>Staff Attendance Management</em> to edit it.
                                </div>
                            }
                        </>
                    }
                />
                <ButtonsSecion>
                    <FormSaveButton saving={uploading} disabled={disableSave()} />
                </ButtonsSecion>
            </form>
        </>
    );
}

export default StaffAttendanceEntry;
