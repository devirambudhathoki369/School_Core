import { SelectInput, TextInput } from "@/components/inputs";
import StaffRoleInput from "@/components/inputs/StaffRoleInput";
import SubjectInput from "@/components/inputs/SubjectInput";
import STAFF_STATUS_OPTIONS from "@/components/inputs/options/staff_status";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function PrimaryInformationSection() {
    const { staff, errors, methods } = useEnrollmentContext();
    return (
        <>
            <Section title={"Staff Information"}>
                <>
                    <div className="sm:col-span-4"></div>
                    <StaffRoleInput input={{ name: 'role', label: 'Staff Role' }}
                        value={staff?.role} error={errors?.role} {...methods} />
                    <SelectInput input={{ name: 'status', label: 'Staff status', options: STAFF_STATUS_OPTIONS }}
                        value={staff?.status} error={errors?.status} {...methods} />
                </>
                <>
                    <TextInput value={staff.first_name} error={errors?.first_name} input={{
                        label: "First Name", name: "first_name"
                    }} {...methods} />
                    <TextInput value={staff.middle_name} error={errors?.middle_name} input={{
                        label: "Middle Name", name: "middle_name"
                    }} {...methods} />
                    <TextInput value={staff.last_name} error={errors?.last_name} input={{
                        label: "Last Name", name: "last_name"
                    }} {...methods} />
                </>
                <>
                    <TextInput value={staff.primary_contact} error={errors?.primary_contact} input={{
                        label: 'Primary Contact', name: 'primary_contact'
                    }} {...methods} />
                    <TextInput value={staff.secondary_contact} error={errors?.secondary_contact} input={{
                        label: 'Secondary Contact', name: 'secondary_contact'
                    }} {...methods} />
                </>
                {/* <>
                    <SubjectInput input={{ name: 'primary_subject', label: 'Primary Subject' }}
                        value={staff?.primary_subject} error={errors?.primary_subject} {...methods} />
                    <SubjectInput input={{ name: 'secondary_subject', label: 'Secondary Subject' }}
                        value={staff?.secondary_subject} error={errors?.secondary_subject} {...methods} />
                </> */}
                <TextInput value={staff.location} error={errors?.location} input={{
                    label: 'Location', name: 'location'
                }} {...methods} />
                <TextInput input={{
                    label: "Joined date", name: "joined_date"
                }} error={errors?.joined_date} value={staff?.joined_date} {...methods} />
            </Section>
        </>
    )
}

export default PrimaryInformationSection;