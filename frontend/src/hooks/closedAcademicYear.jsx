import { useState } from "react"

const useClosedAcademicYear = () => {
    const [closedAcademicYear, setClosedAcademicYear] = useState('');

    function onClosedAcademicYearSelect({ name, value }) {
        setClosedAcademicYear(value);
    }

    function resetClosedAcademicYear() {
        setClosedAcademicYear('');
    }

    return {
        closedAcademicYear, onClosedAcademicYearSelect, resetClosedAcademicYear
    }
}

export default useClosedAcademicYear;