import { OPTION_NONE, SelectInput, TextInput } from "@/components/inputs";
import GenderInput from "@/components/inputs/GenderInput";
import STUDENT_STATUS_OPTIONS from "@/components/inputs/options/student_status";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
// 
function PersonalInformationSection() {
    const { student, methods, errors } = useEnrollmentContext();

    return (
        <Section title={"Personal Information"} description={""}>
            <>
                <>
                    <TextInput input={{
                        label: 'First Name', name: 'first_name'
                    }} error={errors?.first_name} value={student?.first_name} {...methods} />
                    <TextInput input={{
                        label: 'Middle Name', name: 'middle_name'
                    }} error={errors?.middle_name} value={student?.middle_name} {...methods} />
                    <TextInput input={{
                        label: 'Last Name', name: 'last_name'
                    }} error={errors?.last_name} value={student?.last_name} {...methods} />
                </>
                <>
                    <GenderInput error={errors?.gender} value={student.gender} {...methods} />
                    <TextInput input={{ name: 'birth_date', label: 'Date Of Birth (BS)' }}
                        error={errors?.birth_date} value={student.birth_date} {...methods} />
                    <TextInput input={{
                        label: 'Contact Number', name: 'contact'
                    }} error={errors?.contact} value={student?.contact} {...methods} />
                </>
                <>
                    <TextInput input={{
                        label: 'Email Address', name: 'email', type: 'email'
                    }} error={errors?.email} value={student?.email} {...methods} />
                    <TextInput input={{
                        label: 'Location', name: 'location', placeholder: 'City - Ward, District'
                    }} error={errors?.location} value={student.location} {...methods} />
                </>
                <>
                    <TextInput input={{ name: 'emis', label: 'EMIS', type: 'number' }} value={student?.emis} {...methods} />
                    <SelectInput input={{
                        name: 'status', label: 'Status',
                        options: STUDENT_STATUS_OPTIONS
                    }}
                        error={errors?.status} value={student?.status} {...methods} />
                    <TextInput input={{ name: 'previous_school', label: 'Previous School' }} error={errors?.previous_school}
                        value={student?.previous_school} {...methods} />
                </>
            </>
        </Section>
    )
}

export default PersonalInformationSection;