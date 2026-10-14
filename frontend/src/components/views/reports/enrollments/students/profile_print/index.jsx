import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion } from "@/components/sections";
import { selectAction } from "@/components/tables/actions";
import StudentsPicker from "@/components/views/exams/optional_subject_assignment/StudentsPicker";
import { useAppContext } from "@/contexts/AppContext";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useRef, useState } from "react";
import EnrollmentProfile from "./EnrollmentProfile";
import { useReactToPrint } from "react-to-print";

function StudentsProfilePrint() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [selectedClass, setSelectedClass] = useState('');
    const [students, setStudents] = useState([]);
    const [selectedStudents, setSelectedStudents] = useState([]);
    const [pickedAllStudents, setPickedAllStudents] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [generatedStudents, setGeneratedStudents] = useState([]);

    const schoolId = user?.profile?.school || user?.profile?.id;
    const printRef = useRef(null);

    async function onClassSelect(action, id, _class) {
        setSelectedClass(_class);
        await fetchStudents(_class);
    }

    async function fetchStudents(cls) {
        if (!cls?.class_info?.id) {
            updateNotification(500, "Something went wrong!");
            return;
        }
        const [status, msg, data] = await searchStudents({
            school: schoolId,
            class_info: cls.class_info.id,
        });
        if (data) {
            setStudents(data);
        } else {
            updateNotification(status, msg);
        }
    }

    function onStudentSelect({ name, value }) {
        // setInput(state => ({ ...state, students: value }));
        setSelectedStudents(value);
    }

    async function generateProfiles() {
        setGenerating(true);
        const [status, msg, data] = await searchStudents({
            school: schoolId,
            class_info: selectedClass?.class_info?.id,
            students: selectedStudents,
            detailed: true,
            include_classname: true,
            include_images: true,
        });
        setGeneratedStudents(data);
        setGenerating(false);
    }

    const printProfiles = useReactToPrint({
        content: () => printRef.current,
    });

    return (
        <>
            <ChooseClass selectedClass={selectedClass} onSelect={onClassSelect}
                actions={[selectAction]}>
                <>
                    <StudentsPicker students={students || []} data={{ students: selectedStudents }}
                        previousData={[]} onSelect={onStudentSelect} onSelectAll={onStudentSelect}
                        allStudents={{ pickedAllStudents, setPickedAllStudents }} />
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={generateProfiles}
                            disabled={(selectedStudents?.length < 1 || generating)}>
                            {generating ? "Generating..." : "Generate"}
                        </Button>
                        <Button variant="outlined" onClick={printProfiles} disabled={(generatedStudents?.length < 1 || generating)}>Print</Button>
                    </ButtonsSecion>
                </>
                <div ref={printRef}>
                    {
                        generatedStudents?.map((std) => <EnrollmentProfile student={std} />)
                    }
                </div>
            </ChooseClass>
        </>
    )
}

export default StudentsProfilePrint;