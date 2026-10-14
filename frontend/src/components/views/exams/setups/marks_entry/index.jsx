import { useAppContext } from "@/contexts/AppContext";
import { fetchClassPeriodSubjects } from "@/services/functions/classes";
import { useEffect, useState } from "react";
import { selectAction } from "@/components/tables/actions";
import MarksEntryForm from "./MarksEntryForm";
import ChooseClass from "@/components/inputs/ChooseClass";
import useClosedAcademicYear from "@/hooks/closedAcademicYear";
import hasPermission from "@/methods/hasPermission";
import { PERMISSIONS } from "@/configs/permissions";
import AcademicYearNotice from "@/components/AcademicYearNotice";

function MarksEntry() {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const { closedAcademicYear, onClosedAcademicYearSelect } = useClosedAcademicYear();
    // A staff normally sees only the subjects they teach. With RESULT_MAKING
    // (and admins always) they get every subject, to enter the whole result.
    const canMakeResult = hasPermission(user, PERMISSIONS.EXAM.RESULT_MAKING);
    const [subjects, setSubjects] = useState([]);
    const [selectedClass, setSelectedClass] = useState(null);
    const [firstPeriodSubject, setFirstPeriodSubject] = useState('');
    // 
    function onSelect(action, id, item) {
        setSelectedClass(item);
    }
    useEffect(() => {
        if (selectedClass?.class_info?.id) {
            // Every class owns a separate Subject row per subject name, so an
            // option left over from the class picked a moment ago carries THAT
            // class's subject id. Drop the list the instant the class changes,
            // and let only the newest request write it back — otherwise a slow
            // response for the previous class lands last and the picker keeps
            // offering its subjects. Picking one filed the marks under another
            // class's subject, and the gradesheet then printed that subject twice.
            let current = true;
            setSubjects([]);
            setFirstPeriodSubject('');
            (async () => {
                const acay = closedAcademicYear || year?.academic_year;
                // Restrict to the staff's own subjects only when they lack
                // RESULT_MAKING; otherwise pass no staff filter to get them all.
                const staffFilter = (user?.role === "staff" && !canMakeResult) ? user?.profile?.id : '';
                const { data: _subjects, fps } = await fetchClassPeriodSubjects(selectedClass.class_info.id, true, '', staffFilter, true, '', acay);
                if (!current) return;
                if (_subjects && fps) {
                    setSubjects(_subjects.map(e => ({ name: e.subject, value: e.id })));
                    setFirstPeriodSubject(fps);
                }
            })();
            return () => { current = false; };
        }
    }, [selectedClass, closedAcademicYear]);
    return (
        <>
            <AcademicYearNotice />
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}
                info={"Select class for marks entry!"}>
                <MarksEntryForm selectedClass={selectedClass} userProfile={user?.profile} subjects={subjects} firstPeriodSubject={firstPeriodSubject}
                    closedAcademicYear={{ closedAcademicYear, onClosedAcademicYearSelect }} />
            </ChooseClass>
        </>
    )
}

export default MarksEntry;