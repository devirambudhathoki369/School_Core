import { TextInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import OccupationInput from "@/components/inputs/OccupationInput";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import Checkbox from "@/components/inputs/Checkbox";

function GuardianInformationSection() {
    const { student, errors, methods } = useEnrollmentContext();
    // 
    function cloneData(name, self, target) {
        if (self) {
            methods.onChange({ name, value: '' });
            return methods.onBlur({ name, value: null });
        }
        else {
            methods.onChange({ name, value: target });
            return methods.onBlur({ name, value: target });
        }
    }
    // 
    return (
        <Section title={"Guardian Information"} description={""}>
            <>
                <TextInput input={{
                    label: "Father's Full Name", name: 'father_name'
                }} error={errors?.father_name} value={student?.father_name} {...methods} />
                <TextInput input={{
                    label: "Mother's Full Name", name: 'mother_name'
                }} error={errors?.mother_name} value={student?.mother_name} {...methods} />
                <TextInput input={{
                    label: "Guardian's Full Name", name: 'guardian_name'
                }} error={errors?.guardian_name} value={student?.guardian_name} {...methods} />
            </>
            <>
                <div className="flex flex-col sm:col-span-4">
                    <TextInput input={{
                        label: 'Contact', name: 'guardian_contact'
                    }} error={errors?.guardian_contact} value={student.guardian_contact} {...methods} />
                    {student.contact &&
                        <Checkbox onClick={() => {
                            cloneData('guardian_contact', student?.guardian_contact, student.contact);
                        }} checked={student?.guardian_contact} text={"Same contact as above?"} />
                    }
                </div>
                <div className="flex flex-col sm:col-span-4">
                    <TextInput input={{
                        label: 'Location', name: 'guardian_location'
                    }} error={errors?.guardian_location} value={student.guardian_location} {...methods} />
                    {student.location &&
                        <Checkbox onClick={() => {
                            cloneData('guardian_location', student?.guardian_location, student.location);
                        }} checked={student?.guardian_location} text={"Same location as above?"} />
                    }
                </div>
                <TextInput input={{
                    label: 'Email', name: 'guardian_email', type: 'email'
                }} error={errors?.guardian_email} value={student.guardian_email} {...methods} />

            </>
            <>
                <OccupationInput input={{
                    label: "Father's Occupation", name: 'father_occupation'
                }} error={errors?.father_occupation} value={student?.father_occupation} {...methods} />
                <OccupationInput input={{
                    label: "Mother's Occupation", name: 'mother_occupation'
                }} error={errors?.mother_occupation} value={student.mother_occupation} {...methods} />
                <OccupationInput input={{
                    label: "Guardian's Occupation", name: 'grandfather_occupation'
                }} error={errors?.grandfather_occupation} value={student.grandfather_occupation} {...methods} />
            </>
        </Section>
    )
}

export default GuardianInformationSection;