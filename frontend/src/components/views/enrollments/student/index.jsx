import EnrollmentContextProvider, { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import studentSchema from "@/schemas/student";
import { useCallback, useState } from "react";
import { flattenSchema, fillData } from "@/methods/FlattenSchema";
import studentValidationSchema from "@/schemas/validations/student";
import { useAppContext } from "@/contexts/AppContext";
import { saveStudent } from "@/services/functions/students";
import PersonalInformationSection from "./sections/PersonalInformation";
import GuardianInformationSection from "./sections/GuardianInformation";
import GradeInformationSection from "./sections/GradeInformation";
import OtherInformationSection from "./sections/OtherInformation";
import TransportationInformationSection from "./sections/TransportationInformation";
import cleanClassInfo from "@/methods/cleanClassInfo";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import AcademicYearNotice from "@/components/AcademicYearNotice";
// 
function StudentEnrollmentForm() {
    const { fiscalYear: { year, hasFiscalYears }, notification: { updateNotification } } = useAppContext();
    const { student, methods: { resetForm } } = useEnrollmentContext();
    const { uploading, statusHandler } = useRequestStatus();
    // 
    async function handleSubmit(e) {
        e.preventDefault();
        if (!hasFiscalYears()) {
            return;
        }
        statusHandler.toggleUploading();
        try {
            await studentValidationSchema.validate(student);
            student['academic_year'] = year.academic_year; // MUST KEEP THIS LINE HERE;
            const uploadData = fillData(studentSchema, student);
            uploadData["class_info"] = cleanClassInfo(uploadData?.class_info || {});
            // return;
            const [status, message, _] = await saveStudent(uploadData);
            updateNotification(status, message);
            if (status === 201) resetForm();
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    return (
        <form onSubmit={handleSubmit}>
            <div className="space-y-12">
                <AcademicYearNotice />
                <PersonalInformationSection />
                <GuardianInformationSection />
                <GradeInformationSection />
                <TransportationInformationSection />
                <OtherInformationSection />
            </div>
            <div className="w-full my-5 flex justify-center">
                <FormSaveButton saving={uploading} isUpdate={student?.id} />
            </div>
        </form>
    )
}
// 
const _studentSchema = flattenSchema(studentSchema);
function StudentEnrollment() {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    _studentSchema['school'] = user?.profile?.school || user?.profile?.id;
    _studentSchema['academic_year'] = year?.academic_year;
    const [student, setStudent] = useState(() => ({ ..._studentSchema }));
    const [errors, setErrors] = useState({});
    // 
    const onChange = useCallback(({ name, value }) => {
        setStudent(state => ({ ...state, [name]: value }));
    }, []);
    const onBlur = useCallback(async ({ name, value }) => {
        try {
            await studentValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }, []);
    function resetForm() {
        setStudent({ ..._studentSchema });
    }
    // 
    return (
        <EnrollmentContextProvider value={{
            student,
            errors,
            methods: { onChange, onBlur, resetForm }
        }}>
            <StudentEnrollmentForm />
        </EnrollmentContextProvider>
    )
}

export default StudentEnrollment;