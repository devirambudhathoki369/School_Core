import { useEffect, useState } from "react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function BookOperationReport() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [range, setRange] = useState({ start: '', end: '' });
    const [rows, setRows] = useState([]);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) { setRange(s => ({ ...s, [name]: value })); }
    async function load(params = {}) {
        statusHandler.toggleSearching();
        const res = await libraryReport(schoolId, 'book-operation', params);
        setRows(Array.isArray(res) ? res : []);
        statusHandler.toggleSearching();
    }
    useEffect(() => { load(); }, []);
    function onSearch(e) { e.preventDefault(); load(range); }

    return (
        <>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section title={"Book Operation Report"}
                    description={"Per-book issue/return activity. Empty dates = all-time issues."}>
                    <TextInput input={{ name: 'start', label: "From", placeholder: "YYYY-MM-DD" }} value={range.start} onChange={onChange} />
                    <TextInput input={{ name: 'end', label: "To", placeholder: "YYYY-MM-DD" }} value={range.end} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            <BasicTable name={"Book Operation Report"} data={rows} columns={COLUMNS}
                loading={searching} showSelected={false} print={true} allowExport={true} />
        </>
    );
}

const COLUMNS = [
    ['title', "Book name"],
    ['personal_author', "Author"],
    ['issued_count', "Times Issued"],
    ['returned_count', "Times Returned"],
    ['out_count', "Currently Out"],
];

export default BookOperationReport;
