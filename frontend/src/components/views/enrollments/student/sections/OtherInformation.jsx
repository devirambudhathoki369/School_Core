import { Section } from "@/components/sections";
import EthnicityInput from "@/components/inputs/EthnicityInput";
import SportInput from "@/components/inputs/SportInput";
import BloodGroupInput from "@/components/inputs/BloodGroupInput";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function OtherInformationSection() {
    const { student, errors, methods } = useEnrollmentContext();
    return (
        <Section title={"Other Information"}>
            <>
                <EthnicityInput error={errors?.ethnicity} value={student?.ethnicity} {...methods} />
                <SportInput error={errors?.sport} value={student?.sport} {...methods} />
                <BloodGroupInput error={errors?.blood_group} value={student?.blood_group} {...methods} />
            </>
        </Section>
    )
}

export default OtherInformationSection;