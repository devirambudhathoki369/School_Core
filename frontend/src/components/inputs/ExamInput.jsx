import { useEffect, useState } from "react";
import { SearchInput } from ".";
import { fetchExams } from "@/services/functions/exams/exam";
import { useAppContext } from "@/contexts/AppContext";

function ExamInput({ input, schoolId, academic_year, value, onChange, onBlur, error, getExamName = false }) {
    const { fiscalYear: { getNameFromAcademicYear } } = useAppContext();
    const [exams, setExams] = useState({});
    const [examMappings, setExamMappings] = useState({});
    const [academicYearNames, setAcademicYearNames] = useState({});

    function onExamChange({ name, value }) {
        if (getExamName) {
            onChange({ name, value, examName: examMappings?.[value] || '' });
        } else {
            onChange({ name, value });
        }
    }

    useEffect(() => {
        if (academic_year && !exams?.[academic_year]) {
            (async () => {
                const data = await fetchExams(schoolId, academic_year, true);
                setExamMappings(data.reduce((acc, exam) => {
                    acc[exam.value] = exam.name;
                    return acc;
                }, {}));
                setExams(state => ({ ...state, [academic_year]: data }));
            })();
        }
        if (academic_year && !academicYearNames?.[academic_year]) {
            const academic_year_name = getNameFromAcademicYear(academic_year);
            setAcademicYearNames(state => ({ ...state, [academic_year]: academic_year_name }))
        }
    }, [academic_year]);

    return (
        <SearchInput input={{ name: 'exam', label: `${academicYearNames?.[academic_year]} Exams`, options: (exams?.[academic_year] || []), ...input }}
            value={value} onChange={onExamChange} onBlur={onBlur} error={error} />
    )
}

export default ExamInput;