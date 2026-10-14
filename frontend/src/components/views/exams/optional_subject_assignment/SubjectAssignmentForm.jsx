import { useAppContext } from "@/contexts/AppContext";
import { searchStudents } from "@/services/functions/students";
import { Typography, Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import StudentsPicker from "./StudentsPicker";
import useRequestStatus from "@/hooks/requestStatus";
import Loader from "@/components/Loader";
import NotFound from "@/components/NotFound";
import { ButtonsSecion, Section } from "@/components/sections";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import SubjectInput from "@/components/inputs/SubjectInput";
import { fetchOptionalSubjectData, saveOptionalSubjectData } from "@/services/functions/exams/optionalSubjects";

const subjectAssignmentSchema = {
    school: '',
    academic_year: '',
    class_info: '',
    students: [],
    subject: ''
}
function SubjectAssignmentForm({ selectedClass }) {
    const { user: { user }, fiscalYear: { year }, notification: { updateNotification } } = useAppContext();
    const [students, setStudents] = useState([]);
    subjectAssignmentSchema["school"] = user?.profile?.school || user?.profile?.id;
    subjectAssignmentSchema["academic_year"] = year?.academic_year;
    subjectAssignmentSchema["class_info"] = selectedClass?.class_info?.id;
    const [data, setData] = useState({ ...subjectAssignmentSchema });
    const { fetching, uploading, statusHandler } = useRequestStatus();
    const [pickedAllStudents, setPickedAllStudents] = useState(false);

    function onChange({ name, value }) {
        if (name === "student") {
            setData(state => ({ ...state, students: value }));
        } else {
            setData(state => ({ ...state, [name]: value }));
        }
    }
    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, message, res] = await saveOptionalSubjectData(data);
        updateNotification(status, message);
        statusHandler.toggleUploading();
    }

    function onReset() {
        setData({ ...subjectAssignmentSchema });
        setPickedAllStudents(false);
    }

    async function fetchStudents() {
        const [, , data] = await searchStudents({ ...selectedClass.class_info });
        if (data?.length > 0) {
            setStudents(data);
        }
    }
    useEffect(() => {
        if (selectedClass?.class_info?.id) {
            onReset();
            statusHandler.toggleFetching();
            (async () => {
                await fetchStudents();
            })();
            statusHandler.toggleFetching();
        }
    }, [selectedClass?.class_info?.id]);
    useEffect(() => {
        if (data?.subject) {
            (async () => {
                const _assignmentData = await fetchOptionalSubjectData(user?.profile?.school || user?.profile?.id, year?.academic_year, selectedClass?.class_info?.id, data?.subject);
                setData(state => ({ ...state, ..._assignmentData }));
            })();
        }
    }, [data?.subject]);
    // 
    return (
        <div className="my-4">
            <Section>
                <SubjectInput input={{ name: 'subject', label: "Subject" }} onChange={onChange}
                    value={data?.subject} optional={true} class_id={selectedClass?.class_info?.id} />
            </Section>
            <Typography variant="h5">Select students</Typography>
            {
                fetching ? <Loader /> :
                    <>
                        {
                            students?.length > 0 ?
                                <form onSubmit={onSubmit}>
                                    <StudentsPicker students={students || []} data={data} previousData={[]}
                                        onSelect={onChange} onSelectAll={onChange}
                                        allStudents={{ pickedAllStudents, setPickedAllStudents }} />
                                    <ButtonsSecion>
                                        <Button variant="outlined" onClick={onReset}>Reset</Button>
                                        <FormSaveButton saving={uploading} isUpdate={data?.id} />
                                    </ButtonsSecion>
                                </form>
                                : <NotFound error="No students found!" />
                        }
                    </>
            }
        </div>
    )
}

export default SubjectAssignmentForm;