import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch } from "@/services/functions";
import { useState } from "react";

const STAFF_ATTENDANCE_API = "/api/attendance/staff";

const searchSchema = { school: '', date: '' };
function StaffAttendanceReport() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    searchSchema['date'] = user?.today;
    const [input, setInput] = useState({ ...searchSchema });
    const { searching, statusHandler } = useRequestStatus();
    const [history, setHistory] = useState({});

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await __fetch(STAFF_ATTENDANCE_API, {
            school: input.school,
            date: input.date,
        });
        if (res?.exists && res?.attendances?.length > 0) {
            setHistory({
                ...res,
                attendances: res.attendances.reduce((acc, rep) => {
                    rep["status_str"] = rep?.status === true ? "present" : "absent";
                    rep["color"] = rep?.status === true ? "green" : "red";
                    acc.push(rep);
                    return acc;
                }, [])
            });
        } else {
            setHistory({});
            updateNotification(404, "Not found");
        }
        statusHandler.toggleSearching();
    }
    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <TextInput input={{ name: 'date', label: "Date" }} value={input?.date} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <>
                        {history?.attendances?.length > 0 ?
                            <BasicTable name={"Staff Attendance report"} data={history?.attendances || []}
                                print={true} allowExport={true} showSelected={false}
                                columns={[
                                    ['name', 'Staff name'],
                                    ['status_str', "Status"],
                                    ['reason', "Absent reason"],
                                ]} header={
                                    <span className="flex flex-wrap gap-x-5 font-semibold my-1 p-2">
                                        <span>Date : {history?.date}</span>
                                    </span>
                                } footer={
                                    <span className="flex justify-between p-3 font-semibold">
                                        <span>Present : {history?.present}</span>
                                        <span>Absent : {history?.absent}</span>
                                        <span>Total : {history?.total}</span>
                                    </span>
                                }
                            /> :
                            <NotFound />
                        }
                    </>}
            </>
        </>
    );
}

export default StaffAttendanceReport;
