import { useEffect, useState } from "react";
import { useAppContext } from "@/contexts/AppContext";

const useMappedAcademicYears = () => {
    const { fiscalYear: { years, assignedAcademicYears, getAcademicYearName },
        class: { facultyNames } } = useAppContext();
    const [mappedAcademicYears, setMappedAcademicYears] = useState([]);

    function extractKey(key) {
        const regex = /(el|g|c|y|s)(\d+)/g;
        const details = [];
        let match;
        while ((match = regex.exec(key)) !== null) {
            const [_, segment, value] = match;
            details.push({ key: segment, value: parseInt(value, 10) });
        }
        return details;
    }
    function extractNamesFromKeys() {
        setMappedAcademicYears(
            Object.entries(assignedAcademicYears).reduce((acc, [level, { id, academic_year }]) => {
                const details = extractKey(level);
                let className = details.reduce((acc, detail) => {
                    const { key, value } = detail;
                    acc += " " + facultyNames?.[key]?.[value] || "";
                    return acc;
                }, "");
                let academic_year_name;
                if (academic_year) academic_year_name = getAcademicYearName(academic_year, years?.academicYears);
                const color = !academic_year ? 'red' : '';
                acc.push({ id, class: className, academic_year, academic_year_name, details, color });
                return acc;
            }, [])
        )
    }
    useEffect(() => {
        extractNamesFromKeys();
    }, [facultyNames, assignedAcademicYears]);

    return { mappedAcademicYears, extractKey }
}

export default useMappedAcademicYears;