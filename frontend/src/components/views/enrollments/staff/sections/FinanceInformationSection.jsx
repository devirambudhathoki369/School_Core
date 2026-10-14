import { TextInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";

function FinanceInformationSection() {
    const { staff, errors, methods } = useEnrollmentContext();
    return (
        <>
            <Section title={"Finance Information"}>
                <>
                    <TextInput input={{
                        label: "Basic salary (Net)", name: "basic_salary", type: "number"
                    }} error={errors?.basic_salary} value={staff.basic_salary} {...methods} />
                    {/* An earning, exactly like the salary — see the note in
                        the staff profile's Finance tab. */}
                    <TextInput input={{
                        label: "Funds", name: "funds", type: "number"
                    }} error={errors?.funds} value={staff?.funds} {...methods} />
                    <TextInput input={{
                        label: "Grade", name: "grade", type: "number"
                    }} error={errors?.grade} value={staff.grade} {...methods} />
                    <TextInput input={{
                        label: "Allowance", name: "allowance", type: "number"
                    }} error={errors?.allowance} value={staff?.allowance} {...methods} />
                    <TextInput input={{
                        label: "Extra", name: "extra", type: "number"
                    }} error={errors?.extra} value={staff?.extra} {...methods} />
                    <TextInput input={{
                        label: "Pan No.", name: "pan_no", type: "number"
                    }} error={errors?.pan_no} value={staff.pan_no} {...methods} />
                </>
                <>
                    <TextInput input={{
                        label: "Insurance", name: "insurance", type: "number"
                    }} error={errors?.insurance} value={staff.insurance} {...methods} />
                    <TextInput input={{
                        label: "PF Contribution (%)", name: "pf_contrib", type: "number"
                    }} error={errors?.pf_contrib} value={staff.pf_contrib} {...methods} />
                </>
            </Section>
        </>
    )
}

export default FinanceInformationSection;