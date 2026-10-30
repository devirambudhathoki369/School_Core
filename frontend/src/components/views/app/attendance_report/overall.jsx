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
import { ATTENDANCE_API } from "./config";
import PreviousButton from "@/components/buttons/PreviousButton";

const searchSchema = { school: '', from: '', to: '' };
function OverallAttendance() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema["school"] = user?.profile?.school || user?.profile?.id;
    searchSchema["from"] = user?.today;
    searchSchema["to"] = user?.today;
    const [input, setInput] = useState({ ...searchSchema });
    const [data, setData] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const data = await __fetch(ATTENDANCE_API, {
            ...input,
            overall: true
        });
        if (data) {
            setData(data);
        } else {
            setData([]);
            updateNotification(404, "Not Found!");
        }
        statusHandler.toggleSearching();
    }

    return (
        <>
            <ButtonsSecion className={"!justify-start"}>
                <PreviousButton name={"Back"} href={"admin#attendance.report"} />
            </ButtonsSecion>
            <form onSubmit={onSearch}>
                <Section>
                    <TextInput value={input?.from} onChange={onChange} input={{ name: 'from', label: "Date (From)" }} />
                    <TextInput value={input?.to} onChange={onChange} input={{ name: 'to', label: "Date (To)" }} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                </ButtonsSecion>
            </form>
            <div>
                {searching ? <Loader /> :
                    <>
                        {
                            data?.length > 0 ?
                                <BasicTable name={"Overall attendance"} data={data} columns={[
                                    ['classname'],
                                    ['present'],
                                    ['absent']
                                ]} showSelected={false} print={true} /> :
                                <NotFound />
                        }
                    </>
                }
            </div>
        </>
    )
}

export default OverallAttendance;