import BasicTable from "@/components/tables/BasicTable";
import { ChevronRightIcon } from "@heroicons/react/24/outline";
import Warning from "@/components/Warning";
import { useTempState } from "@/contexts/TempStateContext";
import { useRouter } from "next/router";
import { ACADEMIC_YEAR_CLOSING_KEY } from "./configs";
import useMappedAcademicYears from "@/hooks/useMappedAcademicYears";
import { useEffect, useState } from "react";
import TableColumn from "@/components/tables/TableColumn";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";

const _reviewAction = {
    // text: "Review",
    action: "review",
    icon: <span className="flex items-center font-normal">
        Review <ChevronRightIcon className="icon" />
    </span>,
    tooltip: "Review before closing!",
}

function AcademicYearClosing() {
    const { mappedAcademicYears } = useMappedAcademicYears();
    const [academicYears, setAcademicYears] = useState([]);
    // 
    const router = useRouter();
    const { saveTempState } = useTempState();

    function onSelect(action, id, item) {
        if (id && item?.academic_year) {
            saveTempState(ACADEMIC_YEAR_CLOSING_KEY, item);
            router.push("/admin#manage.academic-year-review");
        }
    }

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
            <Warning warning={"If you see an empty table, please contact for support!"} />
            <div className="my-1 flex flex-col gap-y-1 items-center">
                <SeeLogsButton name={linkButtons.invoice.name} href={linkButtons.invoice.href} />
                <SeeLogsButton name={linkButtons.ledger.name} href={linkButtons.ledger.href} />
            </div>
            <BasicTable name={"Close Running Academic Years"} columns={columns}
                data={academicYears} layout="vertical" actions={[_reviewAction]}
                onSelect={onSelect} showSelected={false} />
        </>
    )
}

const columns = [
    new TableColumn("academic_year_name", "Academic Year").asList(),
    new TableColumn("faculties", "Levels/faculties", null, null, "vertical").asList(),
];

const linkButtons = {
    invoice: { name: "Find invoices with incorrect academic year", href: "/admin#reports.invoices-academic-year-mismatch" },
    ledger: { name: "Find ledgers with incorrect academic year", href: "/admin#reports.ledgers-academic-year-mismatch" },
}

export default AcademicYearClosing;