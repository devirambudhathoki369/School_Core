import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useStaffProfile } from "@/contexts/StaffProfile";
import { password } from "@/schemas/validations";

function StaffAccountTab({ tab }) {
    const { data: { staff }, password: { newPassword, errors, onChange: onPwChange, onBlur,
        hasTypedSamePasswords, handlePasswordChange, createAccount },
        status: { uploading } } = useStaffProfile();

    return (
        <>
            <Section>
                <TextInput value={staff?.username} onChange={staff?.username ? () => null : onPwChange} input={{
                    name: 'username', label: 'Username', readOnly: staff?.username
                }} />
            </Section>
            <form onSubmit={staff?.username ? handlePasswordChange : createAccount}>
                <Section>
                    <PasswordInput value={newPassword?.password} error={errors?.password} onChange={onPwChange} onBlur={onBlur} input={{
                        name: 'password', label: 'New password'
                    }} />
                    <PasswordInput value={newPassword?.confirm_password} error={errors?.confirm_password} onChange={onPwChange} onBlur={onBlur} input={{
                        name: 'confirm_password', label: 'Confirm password'
                    }} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton disabled={!hasTypedSamePasswords()}
                        custom={staff?.username ?
                            [uploading, "Change password", "Updating..."] :
                            [uploading, "Create account", "Creating..."]} />
                </ButtonsSecion>
            </form>
        </>
    )
}

export default StaffAccountTab;