import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import StatusCell from "@/components/tables/StatusCell";
import { selectAction, toggleAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __update } from "@/services/functions";
import { searchStudents } from "@/services/functions/students";
import { useState } from "react";
import { ATTENDANCE_API } from "../attendance_report/config";

const _toggleAction = toggleAction("Attend?", "Click to toggle attendance status.");

const searchSchema = { school: '', date: '' };
function AttendanceManagement() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    searchSchema['date'] = user?.today || '';
    const [selectedClass, setSelectedClass] = useState('');
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const { searching, uploading, statusHandler } = useRequestStatus();

    function onClassSelect(action, id, cls) {
        setSelectedClass(cls);
    }
    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    function getAttendanceRow(rep) {
        if (rep?.status !== undefined) {
            rep["status_str"] = rep.status === true ? "present" : "absent";
            rep["color"] = rep.status === true ? "green" : "red";
        }
        return rep;
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        //
        let [status, msg, data] = await searchStudents({
            class_info: selectedClass.class_info.id,
            include_attendance: true,
            ...searchInput,
        });
        if (data?.attendances) {
            data.attendances = data.attendances.reduce((acc, rep, index) => {
                rep["index"] = index;
                rep = getAttendanceRow(rep);
                acc.push(rep);
                return acc;
            }, []);
            setData(data);
        } else {
            setData({});
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    function onAttendanceChange(index, name, value) {
        setData(state => {
            const _s = { ...state };
            _s.attendances[index][name] = value;
            _s.attendances[index]["isUpdated"] = true;
            return _s;
        });
    }

    function onAttend(action, id, item) {
        const { index } = item;
        setData(state => {
            const _s = { ...state };
            let updatedRow = {
                ...item,
                status: !item?.status,
                reason: item?.reason || '',
                isUpdated: true,
            };
            updatedRow = getAttendanceRow(updatedRow);
            _s.attendances[index] = updatedRow;
            return _s;
        });
    }

    function prepareData() {
        let _data = { ...data };
        _data.attendances = _data.attendances.reduce((acc, val) => {
            if (val?.isUpdated === true) {
                const { id, student, status, reason } = val;
                acc.push({ id, student, status, reason });
            }
            return acc;
        }, []);
        _data["class_info"] = selectedClass?.class_info?.id;
        return _data;
    }

    async function onUpdate(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const uploadData = prepareData();
        const [status, msg,] = await __update(ATTENDANCE_API, uploadData, false);
        updateNotification(status, msg);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setSearchInput({ ...searchSchema });
        setData({});
    }

    return (
        <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onClassSelect} >
            <form onSubmit={onSearch}>
                <Section>
                    <TextInput input={{ name: 'date', label: "Date" }} value={searchInput?.date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} disabled={!searchInput?.date} searching={searching} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <>
                        {data?.attendances?.length > 0 ?
                            <form onSubmit={onUpdate}>
                                <BasicTable name={"Attendance management"} data={data?.attendances || []} columns={[
                                    ['name'],
                        // col[5] is BasicTable's custom cell renderer. Present/
                        // absent is the one column on this register a teacher is
                        // actually scanning, and it was rendering as a bare
                        // lower-case word in the same weight as everything else.
                        ['status_str', "Status", null, false, null, StatusCell],
                        ['reason', "Absent Reason"]
                                ]}
                                    editable={uploading ? false : true} editableColumns={[['reason']]}
                                    actions={[_toggleAction]} showSelected={false}
                                    onChange={onAttendanceChange} onSelect={onAttend}
                                />
                                <ButtonsSecion>
                                    <FormSaveButton isUpdate={true} saving={uploading} />
                                </ButtonsSecion>
                            </form> :
                            <NotFound />
                        }
                    </>}
            </>
        </ChooseClass>
    )
}

export default AttendanceManagement;