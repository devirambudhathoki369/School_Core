import EnrollmentContextProvider, { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import staffSchema from "@/schemas/staff";
import { useCallback, useState } from "react";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import staffValidationSchema from "@/schemas/validations/staff";
import { useAppContext } from "@/contexts/AppContext";
import { ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import PrimaryInformationSection from "./sections/PrimaryInformation";
import ExtraInformationSection from "./sections/ExtraInformation";
import FinanceInformationSection from "./sections/FinanceInformationSection";
import { saveStaff } from "@/services/functions/staffs";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import useRequestStatus from "@/hooks/requestStatus";
import FormSaveButton from "@/components/buttons/FormSaveButton";

function StaffEnrollmentForm() {
    const { notification: { updateNotification }, fiscalYear: { hasFiscalYears } } = useAppContext();
    const { staff, methods } = useEnrollmentContext();
    const { uploading, statusHandler } = useRequestStatus();
    // 
    async function handleSubmit(e) {
        e.preventDefault();
        if (!hasFiscalYears()) {
            return;
        }
        statusHandler.toggleUploading();
        try {
            await staffValidationSchema.validate(staff);
            let uploadData = cleanEmptyFields(fillData(staffSchema, staff));
            // return;
            const [status, message, _] = await saveStaff(uploadData);
            updateNotification(status, message);
            if (status === 200) methods.onReset();
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    // 
    return (
        <form onSubmit={handleSubmit}>
            <PrimaryInformationSection />
            <FinanceInformationSection />
            <ExtraInformationSection />
            <ButtonsSecion>
                <Button variant="outlined" onClick={methods.onReset}>Reset</Button>
                <FormSaveButton saving={uploading} disabled={uploading} />
            </ButtonsSecion>
        </form>
    )
}

function StaffEnrollment() {
    const { user: { user } } = useAppContext();
    staffSchema["school"] = user?.profile?.school || user?.profile?.id;
    const [staff, setStaff] = useState(() => ({ ...flattenSchema(staffSchema) }));
    const [errors, setErrors] = useState({});
    // 
    function onReset() {
        setStaff({ ...flattenSchema(staffSchema) });
    }
    const onChange = useCallback(({ name, value }) => {
        setStaff(state => ({ ...state, [name]: value }));
    }, []);
    const onBlur = useCallback(async ({ name, value }) => {
        try {
            // console.log(name, value, student[name]);
            await staffValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }, []);
    // 
    return (
        <EnrollmentContextProvider value={{
            staff,
            errors,
            methods: { onChange, onBlur, onReset }
        }}>
            <StaffEnrollmentForm />
        </EnrollmentContextProvider >
    )
}

export default StaffEnrollment;