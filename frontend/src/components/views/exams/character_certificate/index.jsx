import { OPTION_ALL, SearchInput, SelectInput, TextInput } from "@/components/inputs";
import ChooseClass from "@/components/inputs/ChooseClass";
import { ButtonsSecion, Section } from "@/components/sections";
import { selectAction } from "@/components/tables/actions";
import { searchStudents } from "@/services/functions/students";
import { Button } from "@material-tailwind/react";
import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useAppContext } from "@/contexts/AppContext";
import Warning from "@/components/Warning";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import { saveCharacterCertificate } from "@/services/functions/exams/certificate";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import CharacterCertificate from "./CharacterCertificate";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import AttentionBox from "@/components/AttentionBox";
import { InstitutionType, InstitutionTypeOptions, notSchool, SchoolChiefOptions } from "@/components/views/exams/character_certificate/constants";

const dataSchema = { editable: false, student: '', status: 1 };
const certificateDataSchema = {
    serial_no: "",
    id: "", name: "", guardian_name: "", address: "", from_date: "", to_date: "",
    class: "", exam_year: "", result: "", birth_date: "", remarks: "",
    university: "", uni_sf: "", course: "", specialization: "",
    symbol_no: "", regd_no: "", issue_date: "",
};
function CharacterCertificateView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    certificateDataSchema["issue_date"] = user?.today || "";
    const [selectedClass, setSelectedClass] = useState('');
    const [data, setData] = useState({ ...dataSchema });
    const [studentsPath, setStudentsPath] = useState('');
    const [students, setStudents] = useState({});
    const [studentsMapping, setStudentsMapping] = useState({});
    const [selectedStudent, setSelectedStudent] = useState({ ...certificateDataSchema });
    const { uploading, searching, statusHandler } = useRequestStatus();

    const certificateRef = useRef(null);
    const printCertificate = useReactToPrint({
        content: () => certificateRef.current,
    });

    function prepareStudentDetail(student) {
        const { id, name, birth_date, english_birth_date, location, image,
            father_name, mother_name, guardian_name, guardian_location,
        } = student;
        const full_birth_date = `${birth_date || ""} (B.S.) ${english_birth_date || ""} (A.D.)`;
        return {
            ...certificateDataSchema,
            id, name, birth_date: full_birth_date, english_birth_date, image,
            guardian_name: father_name || mother_name || guardian_name || "",
            address: guardian_location || location || "",
        }
    }

    async function loadStudents(e) {
        e.preventDefault();
        if (!selectedClass?.class_info?.id || !data?.status) {
            updateNotification(404, "Class/Status not selected!");
            return;
        }
        const key = getCCKey(selectedClass.class_info.id, data.status);
        if (!students?.[key]) {
            statusHandler.toggleSearching();
            const { id, created_at, updated_at, academic_year, is_active, name, ...class_info } = selectedClass?.class_info || {};
            let [, , _students] = await searchStudents({
                ...(class_info || {}),
                detailed: true,
                include_images: true,
                english_birth_date: true,
                status: parseInt(data?.status, 10) || 1,
            });
            if (_students) {
                setStudentsPath(key);
                const _studentsMapping = {};
                _students = _students.reduce((acc, std) => {
                    std = prepareStudentDetail(std);
                    _studentsMapping[std.id] = std;
                    acc.push({ value: std.id, name: std.name });
                    return acc;
                }, []);
                setStudentsMapping(state => ({
                    ...state,
                    ..._studentsMapping
                }));
                setStudents(state => ({ ...state, [key]: _students }));
                updateNotification(200, "Students fetched! Select any student!");
            }
            statusHandler.toggleSearching();
        }
    }
    function getCCKey(class_id, student_status) {
        return `${class_id}___${student_status}`;
    }

    async function onClassSelect(action, id, cls) {
        setSelectedClass(cls);
    }
    function onChange({ name, value }) {
        if (name === "student") setSelectedStudent(studentsMapping?.[value] || {});
        else setData(state => ({ ...state, [name]: value }));
    }

    function toAcronym(text) {
        const acronym = text
            .split(/\s+/)
            .map(word => word[0])
            .filter(ch => /[A-Za-z0-9]/.test(ch))
            .join('.')
            .toUpperCase();
        return acronym ? acronym + '.' : '';
    }

    function updateCertificateData({ name, value }) {
        setSelectedStudent(state => ({ ...state, [name]: value }));
        setSelectedStudent(state => {
            const ns = { ...state };
            ns[name] = value;
            if (name === "university") {
                ns["uni_sf"] = toAcronym(value);
            }
            return ns;
        })
    }

    function onReset() {
        setSelectedStudent({ ...certificateDataSchema });
    }

    function isCertificateDataValid(data) {
        // TODO: implement yup validation later if required!
        // fields are derived from certificateDataSchema;
        const requiredFields = ['institution_type', 'name', 'guardian_name', 'address', 'birth_date', 'issue_date'];
        let missingField = requiredFields.find(field => !data?.[field]);
        if (missingField) {
            missingField = missingField.replaceAll('_', ' ');
            updateNotification(404, `Missing required field: ${missingField}!`);
            return false;
        }
        return true;
    }

    async function onCCSave(e) {
        e.preventDefault();
        const { id, serial_no, ...data } = selectedStudent;
        const uploadData = {
            school: user?.profile?.school || user?.profile?.id,
            student: id || "",
            data,
        }
        statusHandler.toggleUploading();
        if (isCertificateDataValid(uploadData.data)) {
            const [status, message, res] = await saveCharacterCertificate(uploadData);
            updateNotification(status, message);
            if (status === 200) {
                const serial_no = res?.data?.serial_no;
                if (serial_no) {
                    setSelectedStudent(state => ({ ...state, serial_no }));
                }
            }
        }
        statusHandler.toggleUploading();
    }
    // 
    return (
        <div className="flex flex-col">
            <ButtonsSecion>
                <SeeLogsButton name={"Recent certificates"} href={"admin#exams.character-certificates"} />
            </ButtonsSecion>
            <ChooseClass selectedClass={selectedClass} actions={[selectAction]} onSelect={onClassSelect}
                info={"Select class then student to auto-fill his/her information!"}>
                <form onSubmit={loadStudents}>
                    <Section>
                        <SelectInput input={{ name: "status", label: "Student's Status", options: STUDENT_STATUS_OPTIONS, readOnly: searching }}
                            value={data?.status} onChange={onChange} />
                    </Section>
                    <ButtonsSecion>
                        <FormSaveButton isSearch={true} searching={searching} disabled={searching} />
                    </ButtonsSecion>
                </form>
                <Section title={"Student"}>
                    <SearchInput value={data?.student || ''} onChange={onChange}
                        input={{ name: 'student', label: 'Student', options: [OPTION_ALL, ...(students?.[studentsPath] || [])] }} />
                </Section>
            </ChooseClass>
            <div className="flex flex-col gap-y-2 my-3">
                <Section>
                    <SelectInput value={selectedStudent?.institution_type || ''} onChange={updateCertificateData}
                        input={{ name: 'institution_type', label: 'Institution type', options: InstitutionTypeOptions }} />
                    {notSchool(selectedStudent?.institution_type) &&
                        <>
                            <TextInput value={selectedStudent?.university || ''} onChange={updateCertificateData}
                                input={{ name: 'university', label: 'University Name (For affiliated college only)' }} />
                        </>
                    }
                    {parseInt(selectedStudent?.institution_type) === InstitutionType.SCHOOL &&
                        <>
                            <SelectInput input={{ name: 'chief', label: "Chief", options: SchoolChiefOptions }}
                                value={selectedStudent?.chief} onChange={updateCertificateData} />
                        </>
                    }
                </Section>
                <Warning warning={"Placeholders are editable !"} />
                {selectedStudent?.institution_type &&
                    <form className="flex flex-col gap-y-2" onSubmit={onCCSave}>
                        <div ref={certificateRef}>
                            <CharacterCertificate student={selectedStudent} editable={data?.editable} onChange={updateCertificateData}
                                schoolName={user?.profile?.school_name || user?.profile?.name || ''} university={selectedStudent?.university} />
                        </div>
                        <>
                            <AttentionBox title="Note" description={`\r Save then print this certificate! \n Check SC No. before printing! \n Required SC No. Format "FiscalYear/SerialNumber"`} />
                        </>
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={onReset}>Reset</Button>
                            <Button variant="outlined" disabled={selectedStudent?.serial_no} onClick={() => {
                                const isEditable = !data.editable;
                                onChange({ name: 'editable', value: isEditable });
                            }}>
                                {data?.editable ? "Lock In" : "Edit"}
                            </Button>
                            <FormSaveButton isUpdate={selectedStudent?.serial_no} saving={uploading} disabled={data?.editable || selectedStudent?.serial_no} />
                            <Button variant="outlined" onClick={printCertificate}
                                disabled={!selectedStudent?.serial_no}
                            >Print</Button>
                        </ButtonsSecion>
                    </form>
                }
            </div>
        </div>
    )
}

export default CharacterCertificateView;