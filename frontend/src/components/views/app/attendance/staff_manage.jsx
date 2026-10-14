import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { toggleAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch, __update } from "@/services/functions";
import { useState } from "react";

const STAFF_ATTENDANCE_API = "/api/attendance/staff";
const _toggleAction = toggleAction("Attend?", "Click to toggle attendance status.");

const searchSchema = { school: '', date: '' };
function StaffAttendanceManagement() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    searchSchema['date'] = user?.today || '';
    const [searchInput, setSearchInput] = useState({ ...searchSchema });
    const [data, setData] = useState({});
    const { searching, uploading, statusHandler } = useRequestStatus();

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
        const res = await __fetch(STAFF_ATTENDANCE_API, {
            school: searchInput.school,
            date: searchInput.date,
        });
        if (res?.attendances?.length > 0) {
            const attendances = res.attendances.reduce((acc, rep, index) => {
                rep["index"] = index;
                rep = getAttendanceRow(rep);
                acc.push(rep);
                return acc;
            }, []);
            setData({ ...res, attendances });
        } else {
            setData({});
            updateNotification(404, "No staff records found.");
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
            let updated = { ...item, status: !item?.status, reason: item?.reason || '', isUpdated: true };
            updated = getAttendanceRow(updated);
            _s.attendances[index] = updated;
            return _s;
        });
    }
    function prepareData() {
        return {
            school: searchInput.school,
            date: searchInput.date,
            attendances: (data?.attendances || []).reduce((acc, val) => {
                if (val?.isUpdated === true) {
                    const { id, staff, status, reason } = val;
                    acc.push({ id, staff, status, reason });
                }
                return acc;
            }, []),
        };
    }
    async function onUpdate(e) {
        e.preventDefault();
        const payload = prepareData();
        if (!payload.attendances.length) {
            updateNotification(400, "Nothing to update.");
            return;
        }
        statusHandler.toggleUploading();
        const [status, msg,] = await __update(STAFF_ATTENDANCE_API, payload, false);
        updateNotification(status, msg);
        if (status === 200) {
            setData({});
            setSearchInput({ ...searchSchema });
        }
        statusHandler.toggleUploading();
    }
    return (
        <>
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
                                <BasicTable name={"Staff Attendance management"} data={data?.attendances || []} columns={[
                                    ['name', 'Staff name'], ['status_str', "Status"], ['reason', "Absent Reason"]
                                ]}
                                    editable={uploading ? false : true} editableColumns={[['reason']]}
                                    actions={[_toggleAction]} showSelected={false}
                                    onChange={onAttendanceChange} onSelect={onAttend}
                                    header={
                                        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 font-semibold p-2">
                                            <span>Date : {data?.date}</span>
                                            <span>Present : {data?.present}</span>
                                            <span>Absent : {data?.absent}</span>
                                            <span>Total : {data?.total}</span>
                                        </div>
                                    }
                                />
                                <ButtonsSecion>
                                    <FormSaveButton isUpdate={true} saving={uploading} />
                                </ButtonsSecion>
                            </form> :
                            <NotFound />
                        }
                    </>
                }
            </>
        </>
    );
}

export default StaffAttendanceManagement;
