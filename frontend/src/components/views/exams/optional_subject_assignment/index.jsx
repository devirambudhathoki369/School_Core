import ChooseClass from "@/components/inputs/ChooseClass";
import { selectAction } from "@/components/tables/actions";
import { useState } from "react";
import SubjectAssignmentForm from "./SubjectAssignmentForm";

function OptionalSubjectAssignment() {
    const [selectedClass, setSelectedClass] = useState('');
    function onSelect(action, id, item) {
        setSelectedClass(item);
    }
    return (
        <>
            <ChooseClass actions={[selectAction]} selectedClass={selectedClass} onSelect={onSelect} >
                <SubjectAssignmentForm selectedClass={selectedClass} />
            </ChooseClass>
        </>
    )
}

export default OptionalSubjectAssignment;