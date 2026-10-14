import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { TextInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { selectAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __fetch } from "@/services/functions";
import { useState } from "react";
import { ATTENDANCE_API } from "./config";

const searchSchema = { school: '', date: '' };
function AttendanceReport() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    searchSchema['date'] = user?.today;
    // 
    const [selectedClass, setSelectedClass] = useState('');
    function onSelect(action, id, item) {
        setSelectedClass(item);
    }
    // 
    const [input, setInput] = useState({ ...searchSchema });
    const { searching, statusHandler } = useRequestStatus();
    const [history, setHistory] = useState([]);

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const data = await __fetch(ATTENDANCE_API, {
            ...input,
            class_info: selectedClass?.class_info?.id,
            include_contact: true,
        });
        if (data?.class_attendance) {
            setHistory({
                ...data,
                attendances: data?.attendances?.reduce((acc, rep) => {
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
            <ButtonsSecion>
                <SeeLogsButton name={"Overall"} href={"admin#app.attendance.overall"} />
            </ButtonsSecion>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}
                info={"Select class for attendance report!"}>
                <form onSubmit={onSearch}>
                    <Section>
                        <TextInput input={{ name: 'date', label: "Date" }} value={input?.date} onChange={onChange} />
                    </Section>
                    <ButtonsSecion>
                        <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                    </ButtonsSecion>
                </form>
                <>
                    {
                        searching ? <Loader /> :
                            <>
                                {
                                    history?.attendances?.length > 0 ?
                                        <>
                                            <BasicTable name={"Attendance report"} data={history?.attendances || []}
                                                print={true} showSelected={false}
                                                columns={[
                                                    ['name'],
                                                    ['contact'],
                                                    ['status_str', "Status"],
                                                    ['reason', "Absent reason"],
                                                ]} header={<>
                                                    <span className="flex gap-x-5 font-semibold my-1">
                                                        <span className="capitalize">Class : {selectedClass?.class_info?.name}</span>
                                                        <span>Date : {history?.date}</span>
                                                    </span>
                                                </>
                                                } footer={
                                                    <span className="flex justify-between p-3 font-semibold">
                                                        <span>Present : {history?.present}</span>
                                                        <span>Absent : {history?.absent}</span>
                                                        <span>Total : {history?.total}</span>
                                                    </span>
                                                } />
                                        </> :
                                        <NotFound />
                                }
                            </>
                    }
                </>
            </ChooseClass>
        </>
    )
}

export default AttendanceReport;