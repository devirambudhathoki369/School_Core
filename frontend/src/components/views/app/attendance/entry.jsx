import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import StatusCell from "@/components/tables/StatusCell";
import { selectAction, toggleAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __save } from "@/services/functions";
import { searchStudents } from "@/services/functions/students";
import { useState } from "react";
import { ATTENDANCE_API } from "../attendance_report/config";

const _toggleAction = toggleAction("Attend?", "Click to toggle attendance status.");

const inputSchema = { school: '', date: '' };
function AttendanceEntry() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState(null);
    inputSchema["school"] = user?.profile?.school || user?.profile?.id;
    inputSchema["date"] = user?.today;
    const [input, setInput] = useState({ ...inputSchema });
    const [data, setData] = useState([]);
    const { searching, uploading, statusHandler } = useRequestStatus();

    async function onClassSelect(action, id, cls) {
        setSelectedClass(cls);
        await onSearch(cls);
    }
    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    async function onSearch(selectedClass) {
        statusHandler.toggleSearching();
        //
        let [status, msg, data] = await searchStudents({
            class_info: selectedClass.class_info.id,
            school: input?.school,
        });
        if (data && data?.length > 0) {
            setData(data.reduce((acc, student, index) => {
                student["index"] = index;
                student["status"] = true; // default to present;
                student = getAttendanceRow(student);
                acc.push(student);
                return acc;
            }, []));
        } else {
            setData([]);
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }
    function onAttendanceChange(index, name, value) {
        setData(state => {
            const _s = [...state];
            _s[index][name] = value;
            return _s;
        });
    }
    function getAttendanceRow(rep) {
        if (rep?.status !== undefined) {
            rep["status_str"] = rep.status === true ? "present" : "absent";
            rep["color"] = rep.status === true ? "green" : "red";
        }
        return rep;
    }
    function onAttend(action, id, item) {
        const { index } = item;
        setData(state => {
            const _s = [...state];
            let updatedRow = {
                ...item,
                status: !item?.status,
                reason: item?.reason || '',
            };
            updatedRow = getAttendanceRow(updatedRow);
            _s[index] = updatedRow;
            return _s;
        });
    }
    function prepareData() {
        let _data = { ...input };
        _data.attendances = data.reduce((acc, val) => {
            const { id: student, status, reason } = val;
            acc.push({ student, status, reason });
            return acc;
        }, []);
        _data["class_info"] = selectedClass?.class_info?.id;
        if (user?.role === "staff") {
            _data["teacher"] = user?.profile?.id; // staff-id!
        }
        return _data;
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const uploadData = prepareData();
        const [status, msg,] = await __save(ATTENDANCE_API, uploadData, false);
        updateNotification(status, msg);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setInput({ ...inputSchema });
        setData([]);
    }
    function disableSave() {
        return !input?.date || !data.every(item => item.hasOwnProperty('status'));
    }
    return (
        <>
            <ChooseClass selectedClass={selectedClass} info={"Select class to take attendance!"}
                actions={[selectAction]} onSelect={onClassSelect}>
                <form onSubmit={onSave}>
                    <BasicTable name={"Attendance entry"} data={data || []} columns={[
                        ['name'],
                        // col[5] is BasicTable's custom cell renderer. Present/
                        // absent is the one column on this register a teacher is
                        // actually scanning, and it was rendering as a bare
                        // lower-case word in the same weight as everything else.
                        ['status_str', "Status", null, false, null, StatusCell],
                        ['reason', "Absent Reason"]
                    ]} loading={searching}
                        editable={uploading ? false : true} editableColumns={[['reason']]}
                        actions={[_toggleAction]} showSelected={false}
                        onChange={onAttendanceChange} onSelect={onAttend}
                        header={
                            <>
                                <Section>
                                    <TextInput input={{ name: 'date', label: "Date" }} value={input?.date} onChange={onChange} />
                                </Section>
                            </>
                        }
                    />
                    <ButtonsSecion>
                        <FormSaveButton saving={uploading} disabled={disableSave()} />
                    </ButtonsSecion>
                </form>
            </ChooseClass>
        </>
    )
}

export default AttendanceEntry;