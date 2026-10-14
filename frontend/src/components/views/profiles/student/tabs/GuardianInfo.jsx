import { TextInput } from "@/components/inputs";
import OccupationInput from "@/components/inputs/OccupationInput";
import { Section } from "@/components/sections";
import { useStudentProfile } from "@/contexts/StudentProfile";
import ProfileButtons from "./ProfileButtons";

function GuardianInfoTab({ tab }) {
    const { data: { student: guardian_info }, methods: { onChange }, view: { isReadOnly } } = useStudentProfile();
    const readOnly = isReadOnly(tab.key);
    return (
        <>
            <Section title={"Guardian Details"}>
                <TextInput input={{ name: 'father_name', label: "Father's Name", readOnly }}
                    value={guardian_info?.father_name} onChange={onChange} />
                <TextInput input={{ name: 'mother_name', label: "Mother's Name", readOnly }}
                    value={guardian_info?.mother_name} onChange={onChange} />
                <TextInput input={{ name: 'guardian_name', label: "Guardian's Name", readOnly }}
                    value={guardian_info?.guardian_name} onChange={onChange} />
                <TextInput input={{ name: 'guardian_contact', label: "Guardian's contact", readOnly }}
                    value={guardian_info?.guardian_contact || ''} onChange={onChange} />
                <TextInput input={{ name: 'guardian_email', label: "Guardian's email", readOnly }}
                    value={guardian_info?.guardian_email || ''} onChange={onChange} />
                <TextInput input={{ name: 'guardian_location', label: "Guardian's location", readOnly }}
                    value={guardian_info?.guardian_location || ''} onChange={onChange} />
                <OccupationInput input={{ readOnly, name: 'father_occupation', label: "Father's occupation" }}
                    value={guardian_info?.father_occupation} onChange={onChange} />
                <OccupationInput input={{ readOnly, name: 'mother_occupation', label: "Mother's occupation" }}
                    value={guardian_info?.mother_occupation} onChange={onChange} />
                <OccupationInput input={{ readOnly, name: 'grandfather_occupation', label: "Grandfather's occupation" }}
                    value={guardian_info?.grandfather_occupation} onChange={onChange} />
            </Section>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default GuardianInfoTab;