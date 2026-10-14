import PreviousButton from "@/components/buttons/PreviousButton";
import BasicTable from "@/components/tables/BasicTable";
import TableColumn from "@/components/tables/TableColumn";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import useMappedAcademicYears from "@/hooks/useMappedAcademicYears";
import { __search } from "@/services/functions";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { Typography } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const API_PATH = "/api/search/invoices_academic_year_mismatch";
function InvoicesAcademicYearMismatch() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { mappedAcademicYears } = useMappedAcademicYears();
    const [academicYears, setAcademicYears] = useState([]);
    const [selectedYear, setSelectedYear] = useState({});
    const { fetching, statusHandler } = useRequestStatus();
    const [invoices, setInvoices] = useState({});

    function onSelect(action, id, item) {
        if (id && item?.academic_year) {
            setSelectedYear(item);
        }
    }

    async function fetchMismatchedTransactions() {
        const schoolId = user?.profile?.school || user?.profile?.id;
        statusHandler.toggleFetching();
        const [status, msg, _transactions] = await __search(API_PATH, {
            ...selectedYear,
            school: schoolId,
        });
        if (_transactions?.length > 0) {
            setInvoices(state => ({ ...state, [selectedYear.id]: _transactions }));
        } else {
            updateNotification(404, "Not found!");
        }
        statusHandler.toggleFetching();
    }

    useEffect(() => {
        // fetchTransactions;
        if (selectedYear?.id && selectedYear?.academic_year) {
            fetchMismatchedTransactions();
        }
    }, [selectedYear]);

    useEffect(() => {
        const _data = mappedAcademicYears.reduce((acc, yr) => {
            let { id, details, academic_year, academic_year_name, class: faculty } = yr;
            faculty = faculty.toUpperCase();
            if (acc?.[academic_year]) {
                acc[academic_year]["faculties"].push(faculty);
                acc[academic_year]["classes"].push(details);
            } else {
                acc[academic_year] = { id, academic_year, academic_year_name };
                acc[academic_year]["faculties"] = [faculty];
                acc[academic_year]["classes"] = [details];
            }
            return acc;
        }, {});
        setAcademicYears(Object.values(_data));
    }, [mappedAcademicYears]);

    return (
        <>
            <PreviousButton />
            <Typography variant="h5" className={`my-2 text-center text-blue-gray-800`}>
                Invoices Academic Year Mistmatch
            </Typography>
            <BasicTable name={"Running Academic Years"} columns={academicYearsColumns}
                data={academicYears} actions={[_viewAction]}
                onSelect={onSelect} header={
                    <span>Click on view action to see list!</span>
                } />
            <>
                {
                    selectedYear?.id && selectedYear?.academic_year &&
                    <BasicTable name={`Invoices mismatches for academic year ${selectedYear?.academic_year_name}`}
                        header={
                            <span className="text-semibold text-base text-black capitalize">Academic year must be &nbsp;
                                <span className="font-bold text-lg">{selectedYear?.academic_year_name}!</span>
                            </span>
                        }
                        columns={invoicesColumns} data={invoices?.[selectedYear?.id] || []}
                        loading={fetching} showSelected={false} print allowExport onSelect={() => null} />
                }
            </>
        </>
    )
}

const academicYearsColumns = [
    new TableColumn("academic_year_name", "Academic Year").asList(),
    new TableColumn("faculties", "Levels/faculties", null, null, "vertical").asList(),
];
const invoicesColumns = [
    ['invoice_id', "Invoice No."],
    ["date"],
    ["academic_year_name", "Academic Year", , true],
    ["student_name", "Student Name"],
    ["class_name", "Class"],
];

const _viewAction = {
    // text: "Review",
    action: "view",
    icon: <span className="flex items-center font-normal">
        View <ChevronRightIcon className="icon" />
    </span>,
}

export default InvoicesAcademicYearMismatch;