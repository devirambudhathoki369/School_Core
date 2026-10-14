import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function IssuedByStudents() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [rows, setRows] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();

    async function load() {
        statusHandler.toggleFetching();
        const res = await libraryReport(schoolId, 'issued-by-students');
        setRows(Array.isArray(res) ? res : []);
        statusHandler.toggleFetching();
    }
    useEffect(() => { load(); }, []);

    // the School column only earns its place when another school's student is
    // actually on the list (this library may serve guest schools).
    const columns = rows.some(r => r?.borrower_school)
        ? [...COLUMNS.slice(0, 4), ['borrower_school', "School"], ...COLUMNS.slice(4)]
        : COLUMNS;
    return (
        <BasicTable name={"Issued Books By Students"} data={rows} columns={columns}
            loading={fetching} showSelected={false} print={true} allowExport={true}
            topActions={<Button variant="outlined" className="hide-from-print" onClick={load}>Refresh</Button>} />
    );
}

const COLUMNS = [
    ['accession_no', "Accession No."],
    ['book_name', "Book name"],
    ['borrower', "Student"],
    ['classname', "Class"],
    ['issued_date', "Issued Date"],
    ['due_date', "Due Date"],
];

export default IssuedByStudents;
