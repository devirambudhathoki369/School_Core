import { useState } from "react";
import { Button } from "@material-tailwind/react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function DailyReport() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [date, setDate] = useState(user?.today || '');
    const [rows, setRows] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await libraryReport(schoolId, 'daily', { date });
        setRows(res?.rows || []);
        statusHandler.toggleSearching();
    }

    // guest schools' students borrow here too — name their school when one shows up.
    const columns = (rows || []).some(r => r?.borrower_school)
        ? [...COLUMNS.slice(0, 4), ['borrower_school', "School"], ...COLUMNS.slice(4)]
        : COLUMNS;
    return (
        <>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section title={"Daily Report"}>
                    <TextInput input={{ name: 'date', label: "Date" }} value={date}
                        onChange={({ value }) => setDate(value)} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            {rows &&
                <BasicTable name={`Daily Report — ${date}`} data={rows} columns={columns}
                    loading={searching} showSelected={false} print={true} allowExport={true} />}
        </>
    );
}

const COLUMNS = [
    ['action', "Action"],
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['borrower', "User"],
    ['date', "Date"],
    ['fine_amount', "Fine"],
];

export default DailyReport;
