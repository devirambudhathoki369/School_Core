import { TextInput } from "@/components/inputs";
import ProfileButtons from "./ProfileButtons";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { Textarea } from "@material-tailwind/react";
import EthnicityInput from "@/components/inputs/EthnicityInput";
import SportInput from "@/components/inputs/SportInput";
import BloodGroupInput from "@/components/inputs/BloodGroupInput";
import { Section } from "@/components/sections";
import GenderInput from "@/components/inputs/GenderInput";

function OtherInfoTab({ tab }) {
    const { data: { staff, errors }, methods, view: { isReadOnly } } = useStaffProfile();
    const readOnly = isReadOnly(tab.key);
    return (
        <>
            <>
                <Section>
                    <>
                        <TextInput input={{
                            label: "Father's Full Name", name: 'father_name', readOnly
                        }} value={staff?.father_name} error={errors?.father_name} {...methods} />
                        <TextInput input={{
                            label: "Mother's Full Name", name: 'mother_name', readOnly
                        }} value={staff?.mother_name} error={errors?.mother_name} {...methods} />
                    </>
                    <>
                        <TextInput input={{ name: 'birth_date', label: 'Date Of Birth (BS)', readOnly }}
                            value={staff.birth_date} error={errors?.birth_date} {...methods} />
                        <GenderInput value={staff.gender} {...methods} />
                        <TextInput input={{
                            label: 'Email Address', name: 'email', type: 'email', readOnly
                        }} value={staff?.email} error={errors?.email} {...methods} />
                        <TextInput input={{
                            label: 'Citizenship No.', name: 'citizenship_no', readOnly
                        }} value={staff?.citizenship_no} error={errors?.citizenship_no} {...methods} />
                    </>
                    <>
                        <div className="sm:col-span-4">
                            <Textarea readOnly={readOnly} value={staff?.qualification} error={errors?.qualification} className="!text-base" name="qualification" label="Qualification"
                                onChange={(e) => {
                                    const { name, value } = e.target;
                                    methods.onChange({ name, value });
                                }} onBlur={(e) => {
                                    const { name, value } = e.target;
                                    methods.onBlur({ name, value });
                                }} />
                            {/* <Error /> */}
                        </div>
                        <div className="sm:col-span-4">
                            <Textarea readOnly={readOnly} value={staff?.experience} error={errors?.experience} className="!text-base" name="experience" label="Experience"
                                onChange={(e) => {
                                    const { name, value } = e.target;
                                    methods.onChange({ name, value });
                                }} onBlur={(e) => {
                                    const { name, value } = e.target;
                                    methods.onBlur({ name, value });
                                }} />
                            {/* <Error /> */}
                        </div>
                        <div className="sm:col-span-4"></div>
                    </>
                    <>
                        <EthnicityInput value={staff?.ethnicity} {...methods} />
                        <SportInput value={staff?.sport} {...methods} />
                        <BloodGroupInput value={staff?.blood_group} {...methods} />
                    </>
                </Section>
            </>
            <ProfileButtons tab={tab} />
        </>
    )
}

export default OtherInfoTab;