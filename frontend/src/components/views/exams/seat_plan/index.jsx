import dynamic from "next/dynamic";
const StudentSeatLabels = dynamic(() => import("../seat_plan_old"));

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
    const [mode, setMode] = useState("rooms");
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
        <>
        <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Seat plan tools">
            <button type="button" aria-pressed={mode === 'rooms'}
                className="rounded border px-4 py-2" onClick={() => setMode('rooms')}>Room seating</button>
            <button type="button" aria-pressed={mode === 'labels'}
                className="rounded border px-4 py-2" onClick={() => setMode('labels')}>Student photo labels</button>
        </div>
        {mode === 'labels' ? <StudentSeatLabels /> : <Planner schoolId={schoolId} classesBackup={classesBackup} updateNotification={updateNotification}
            exams={exams} examLabel={yearName ? `${yearName} Exams` : "Exam"} />}
        </>
    );
}

export default SeatPlan;
