import { useState } from "react";
import { selectAction } from "@/components/tables/actions";
import { RoutineSetupForm } from "./RoutineSetupForm";
import ChooseClass from "@/components/inputs/ChooseClass";
import AcademicYearNotice from "@/components/AcademicYearNotice";

function ManageExamSchedules() {
    const [selectedClass, setSelectedClass] = useState('');
    // 
    function onSelect(action, id, item) {
        setSelectedClass(item);
    }
    return (
        <>
            <AcademicYearNotice />
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onSelect}
                info={"Select class then manage exam schedule for the class!"} hideSections={true}>
                <RoutineSetupForm selectedClass={selectedClass} setSelectedClass={setSelectedClass} />
            </ChooseClass>
        </>
    )
}

export default ManageExamSchedules;