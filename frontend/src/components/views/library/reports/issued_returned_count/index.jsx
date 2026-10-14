import { useState } from "react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function IssuedReturnedCount() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [range, setRange] = useState({ start: '', end: '' });
    const [rows, setRows] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) { setRange(s => ({ ...s, [name]: value })); }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const res = await libraryReport(schoolId, 'issued-returned-count', range);
        setRows(Array.isArray(res) ? res : []);
        statusHandler.toggleSearching();
    }

    return (
        <>
            <form className="hide-from-print my-2" onSubmit={onSearch}>
                <Section title={"No. of Issued & Returned Books"}
                    description={"Leave dates empty for all-time totals, or pick a range."}>
                    <TextInput input={{ name: 'start', label: "From", placeholder: "YYYY-MM-DD" }} value={range.start} onChange={onChange} />
                    <TextInput input={{ name: 'end', label: "To", placeholder: "YYYY-MM-DD" }} value={range.end} onChange={onChange} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
            {rows &&
                <BasicTable name={"No. of Issued & Returned Books"} data={rows} columns={COLUMNS}
                    loading={searching} showSelected={false} includeSN={false} print={true} />}
        </>
    );
}

const COLUMNS = [
    ['metric', "Metric"],
    ['value', "Count"],
];

export default IssuedReturnedCount;
