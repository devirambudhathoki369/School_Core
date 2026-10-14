import { Section } from "@/components/sections";
import ProfileButtons from "./ProfileButtons";
import { useStudentProfile } from "@/contexts/StudentProfile";
import EthnicityInput from "@/components/inputs/EthnicityInput";
import SportInput from "@/components/inputs/SportInput";
import BloodGroupInput from "@/components/inputs/BloodGroupInput";

function OtherInfoTab({ tab }) {
    const { data: { student },
        methods: { onChange }, view: { isReadOnly } } = useStudentProfile();
    const readOnly = isReadOnly(tab.key);
    return (
        <>
            <Section title={"Other Details"}>
                <EthnicityInput value={student?.ethnicity} onChange={onChange} disabled={readOnly} />
                <SportInput value={student?.sport} onChange={onChange} disabled={readOnly} />
                <BloodGroupInput value={student?.blood_group} onChange={onChange} disabled={readOnly} />
            </Section>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default OtherInfoTab;