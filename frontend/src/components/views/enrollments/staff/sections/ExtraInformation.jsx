import Error from "@/components/Error";
import { PasswordInput, TextInput } from "@/components/inputs";
import BloodGroupInput from "@/components/inputs/BloodGroupInput";
import EthnicityInput from "@/components/inputs/EthnicityInput";
import GenderInput from "@/components/inputs/GenderInput";
import MarritalStatusInput from "@/components/inputs/MarritalStatusInput";
import SportInput from "@/components/inputs/SportInput";
import { Section } from "@/components/sections";
import { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import { Textarea } from "@material-tailwind/react";

function ExtraInformationSection() {
    const { staff, errors, methods } = useEnrollmentContext();
    return (
        <>
            <Section title={"Other Information"}>
                <>
                    <TextInput input={{
                        label: "Father's Full Name", name: 'father_name'
                    }} error={errors?.father_name} value={staff?.father_name} {...methods} />
                    <TextInput input={{
                        label: "Mother's Full Name", name: 'mother_name'
                    }} error={errors?.mother_name} value={staff?.mother_name} {...methods} />
                </>
                <>
                    <TextInput input={{ name: 'birth_date', label: 'Date Of Birth (BS)' }}
                        error={errors?.birth_date} value={staff.birth_date} {...methods} />
                    <GenderInput error={errors?.gender} value={staff.gender} {...methods} />
                    <MarritalStatusInput value={staff?.marrital_status} error={errors?.marrital_status} {...methods} />
                    <TextInput input={{
                        label: 'Email Address', name: 'email', type: 'email'
                    }} error={errors?.email} value={staff?.email} {...methods} />
                    <TextInput input={{
                        label: 'Citizenship No.', name: 'citizenship_no'
                    }} error={errors?.citizenship_no} value={staff?.citizenship_no} {...methods} />
                </>
                <>
                    <div className="sm:col-span-4">
                        <Textarea value={staff?.qualification} className="!text-base" name="qualification" label="Qualification"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                methods.onChange({ name, value });
                            }} onBlur={(e) => {
                                const { name, value } = e.target;
                                methods.onBlur({ name, value });
                            }} />
                        <Error error={errors?.qualification} />
                    </div>
                    <div className="sm:col-span-4">
                        <Textarea value={staff?.experience} className="!text-base" name="experience" label="Experience"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                methods.onChange({ name, value });
                            }} onBlur={(e) => {
                                const { name, value } = e.target;
                                methods.onBlur({ name, value });
                            }} />
                        <Error error={errors?.experience} />
                    </div>
                    <div className="sm:col-span-4"></div>
                </>
                <>
                    <EthnicityInput error={errors?.ethnicity} value={staff?.ethnicity} {...methods} />
                    <SportInput error={errors?.sport} value={staff?.sport} {...methods} />
                    <BloodGroupInput error={errors?.blood_group} value={staff?.blood_group} {...methods} />
                </>
            </Section>
            <Section title={"Staff's Account"}
                description={"An account is optional and may be needed for teachers only."}>
                <TextInput value={staff?.username} input={{ name: 'username', label: 'Username' }} {...methods} error={errors?.username} />
                <PasswordInput value={staff?.password} input={{ name: 'password', label: 'Password' }} {...methods} error={errors?.password} />
            </Section>
        </>
    )
}

export default ExtraInformationSection;