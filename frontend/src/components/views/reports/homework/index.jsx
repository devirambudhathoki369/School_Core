import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { Typography } from "@material-tailwind/react";
import { useState } from "react";

const APIPath = "/api/homework_report";

function HomeworkReport() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;
    // Default the date filter to today's BS date (editable).
    const [searchInput, setSearchInput] = useState({ date: user?.today || '' });
    const [data, setData] = useState([]);
    // Date the currently-shown results were fetched for — drives the print
    // header so it stays correct even if the user edits the input afterwards.
    const [reportDate, setReportDate] = useState('');
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setSearchInput(state => ({ ...state, [name]: value }));
    }

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const [status, msg, _data] = await __search(APIPath, { school, ...searchInput });
        if (status === 200) {
            setData(_data?.data || []);
            setReportDate(searchInput?.date || user?.today || '');
        } else {
            updateNotification(status, msg);
        }
        statusHandler.toggleSearching();
    }

    return (
        <>
            <form onSubmit={onSearch}>
                <Section>
                    <TextInput value={searchInput?.date} onChange={onChange} input={{
                        name: 'date', label: 'Date (BS)'
                    }} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <>
                {searching ? <Loader /> :
                    <BasicTable name="Homework Report" header={
                        reportDate ?
                            <Typography variant="h6" className="text-center mb-2 text-black">
                                Date (BS): {reportDate}
                            </Typography> : null
                    } columns={[
                        ['teacher'],
                        ['classname', 'class'],
                        ['subject_name', 'subject'],
                        ['title'],
                        ['description'],
                        ['due_date', 'due date'],
                    ]} data={data} loading={searching}
                        showSelected={false} print allowExport />
                }
            </>
        </>
    )
}

export default HomeworkReport;
