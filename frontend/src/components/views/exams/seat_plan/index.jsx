import { useEffect, useState } from "react";

import { useAppContext } from "@/contexts/AppContext";
import { fetchExams } from "@/services/functions/exams/exam";
import Planner from "./Planner";

function SeatPlan() {
    const {
        user: { user },
        class: { classesBackup },
        fiscalYear: { year, getNameFromAcademicYear },
        notification: { updateNotification },
    } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    const academicYear = year?.academic_year;
    // the exams of the academic year in use, as picker options (null = loading)
    const [exams, setExams] = useState(null);

    useEffect(() => {
        if (!schoolId || !academicYear) return;
        let alive = true;
        (async () => {
            const list = await fetchExams(schoolId, academicYear, true);
            if (alive) setExams(Array.isArray(list) ? list : []);
        })();
        return () => { alive = false; };
    }, [schoolId, academicYear]);

    const yearName = academicYear ? getNameFromAcademicYear(academicYear) : "";
    return (
        <Planner schoolId={schoolId} classesBackup={classesBackup} updateNotification={updateNotification}
            exams={exams} examLabel={yearName ? `${yearName} Exams` : "Exam"} />
    );
}

export default SeatPlan;
