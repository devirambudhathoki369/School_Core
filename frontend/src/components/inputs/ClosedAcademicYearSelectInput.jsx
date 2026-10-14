import { useEffect, useState } from "react";
import { SearchInput } from ".";
import { useAppContext } from "@/contexts/AppContext";

function ClosedAcademicYearSelectInput({ value, onChange, showRunning = false }) {
    const { fiscalYear: { years, year } } = useAppContext();
    const [defaultYear, setDefaultYear] = useState('');
    const [options, setOptions] = useState([]);

    useEffect(() => {
        if (year?.academic_year) {
            setDefaultYear(year.academic_year);
        }
        if (showRunning) {
            setOptions(
                [getDefaultOption(defaultYear || ''), ...(years?.closedAcademicYears || [])]
            )
        } else {
            setOptions(years?.closedAcademicYears || []);
        }
    }, [year?.academic_year]);

    return (
        <>
            <SearchInput input={{
                name: "closed_academic_year", label: "Closed Academic Year",
                options,
            }}
                value={value} onChange={onChange} />
        </>
    )
}

function getDefaultOption(academic_year) {
    return { name: "Running", value: academic_year };
}

export default ClosedAcademicYearSelectInput;