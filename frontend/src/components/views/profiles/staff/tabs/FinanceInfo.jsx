import { useStaffProfile } from "@/contexts/StaffProfile";
import ProfileButtons from "./ProfileButtons";
import { Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";

function FinanceInfoTab({ tab }) {
    const { data: { staff, errors }, methods, view: { isReadOnly } } = useStaffProfile();
    const readOnly = isReadOnly(tab.key);
    return (
        <>
            <>
                <Section>
                    <>
                        <TextInput input={{
                            label: "Basic salary (Net)", name: "basic_salary", type: "number", readOnly
                        }} value={staff?.basic_salary} error={errors?.basic_salary} {...methods} />
                        {/* Funds is a second EARNING and sits right under the
                            salary everywhere it appears — the posting table,
                            the pay slip, the salary sheet and the ledger. */}
                        <TextInput input={{
                            label: "Funds", name: "funds", type: "number", readOnly
                        }} value={staff?.funds} error={errors?.funds} {...methods} />
                        <TextInput input={{
                            label: "Grade", name: "grade", type: "number", readOnly
                        }} value={staff?.grade} error={errors?.grade} {...methods} />
                        <TextInput input={{
                            label: "Allowance", name: "allowance", type: "number", readOnly
                        }} value={staff?.allowance} error={errors?.allowance} {...methods} />
                    </>
                    <>
                        <TextInput input={{
                            label: "Extra", name: "extra", type: "number", readOnly
                        }} value={staff?.extra} error={errors?.extra} {...methods} />
                        <TextInput input={{
                            label: "Pan No.", name: "pan_no", type: "number", readOnly
                        }} value={staff?.pan_no} error={errors?.pan_no} {...methods} />
                    </>
                    <>
                        <TextInput input={{
                            label: "Insurance", name: "insurance", type: "number", readOnly
                        }} value={staff.insurance} error={errors?.insurance} {...methods} />
                        <TextInput input={{
                            label: "PF Contribution (%)", name: "pf_contrib", type: "number", readOnly
                        }} value={staff.pf_contrib} error={errors?.pf_contrib} {...methods} />
                    </>
                </Section>
            </>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default FinanceInfoTab;