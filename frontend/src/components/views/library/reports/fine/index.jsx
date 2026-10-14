import { useState } from "react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function FineReport() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [range, setRange] = useState({ start: '', end: '' });
    const [data, setData] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) { setRange(s => ({ ...s, [name]: value })); }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await libraryReport(schoolId, 'fine', range);
        setData(res || { rows: [], total: 0 });
        statusHandler.toggleSearching();
    }

    // guest schools' students borrow here too — name their school when one shows up.
    const columns = (data?.rows || []).some(r => r?.borrower_school)
        ? [...COLUMNS.slice(0, 4), ['borrower_school', "School"], ...COLUMNS.slice(4)]
        : COLUMNS;
    return (
        <>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section title={"Fine Report"} description={"Empty dates = all-time fines (by return date)."}>
                    <TextInput input={{ name: 'start', label: "From", placeholder: "YYYY-MM-DD" }} value={range.start} onChange={onChange} />
                    <TextInput input={{ name: 'end', label: "To", placeholder: "YYYY-MM-DD" }} value={range.end} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            {data &&
                <BasicTable name={"Fine Report"} data={data.rows || []} columns={columns}
                    loading={searching} showSelected={false} print={true} allowExport={true}
                    footer={
                        <div className="flex justify-end p-2 font-semibold border-t border-blue-gray-200">
                            Total Fine : {data.total || 0}
                        </div>
                    } />}
        </>
    );
}

const COLUMNS = [
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['borrower', "User"],
    ['classname', "Class"],
    ['returned_date', "Returned Date"],
    ['fine_amount', "Fine"],
];

export default FineReport;
