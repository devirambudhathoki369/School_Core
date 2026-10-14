import ChooseClass from "@/components/inputs/ChooseClass";
import { selectAction } from "@/components/tables/actions";
import { useState } from "react";
import Subjects from "./Subjects";
import Warning from "@/components/Warning";

function ManageSubjectsClasswise() {
    const [selectedClass, setSelectedClass] = useState('');

    function onClassSelect(action, id, item) {
        setSelectedClass(item);
    }

    return (
        <>
            <Warning warning={"Setup subjects in class (not in sections until required!), **Create classes first then sections!"} />
            <ChooseClass selectedClass={selectedClass} onSelect={onClassSelect} actions={[selectAction]}
                info={"Select class before subjects setup!"} onReset={() => { setSelectedClass('') }} hideSections={true}>
                <Subjects classId={selectedClass?.class_info?.id} />
            </ChooseClass>
        </>
    )
}

export default ManageSubjectsClasswise;