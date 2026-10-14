import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function IssuedByTeachers() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [rows, setRows] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();

    async function load() {
        statusHandler.toggleFetching();
        const res = await libraryReport(schoolId, 'issued-by-teachers');
        setRows(Array.isArray(res) ? res : []);
        statusHandler.toggleFetching();
    }
    useEffect(() => { load(); }, []);

    return (
        <BasicTable name={"Issued Books By Teachers"} data={rows} columns={COLUMNS}
            loading={fetching} showSelected={false} print={true} allowExport={true}
            topActions={<Button variant="outlined" className="hide-from-print" onClick={load}>Refresh</Button>} />
    );
}

const COLUMNS = [
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['borrower', "Teacher"],
    ['issued_date', "Issued Date"],
    ['due_date', "Due Date"],
];

export default IssuedByTeachers;
