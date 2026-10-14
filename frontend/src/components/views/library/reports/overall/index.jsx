import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { libraryReport } from "@/services/functions/library/reports";

function OverallLibraryReport() {
    const { user: { user } } = useAppContext();
    if (isUsingSharedLibrary(user)) return <UsingSharedLibraryAlert />;
    const schoolId = user?.profile?.school || user?.profile?.id;

    const [rows, setRows] = useState([]);
    const { fetching, statusHandler } = useRequestStatus();

    async function load() {
        statusHandler.toggleFetching();
        const res = await libraryReport(schoolId, 'overall');
        setRows(Array.isArray(res) ? res : []);
        statusHandler.toggleFetching();
    }
    useEffect(() => { load(); }, []);

    return (
        <BasicTable name={"Overall Library Report"} data={rows} columns={COLUMNS}
            loading={fetching} showSelected={false} includeSN={false} print={true}
            topActions={<Button variant="outlined" className="hide-from-print" onClick={load}>Refresh</Button>} />
    );
}

const COLUMNS = [
    ['metric', "Metric"],
    ['value', "Count"],
];

export default OverallLibraryReport;
