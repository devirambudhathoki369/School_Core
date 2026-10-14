import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import usePasswordChange from "@/hooks/passwordChange";
import useRequestStatus from "@/hooks/requestStatus";
import changeOwnPassword from "@/services/functions/auth/change_own_password";
import { useState } from "react";

const afterChangeExitTime = 2 * 1000; // after 2 seconds!

/**
 * The superadmin (or superuser) changes their own password. Admins do this from
 * school settings; this is the console's equivalent.
 */
function MyPassword() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const { newPassword, errors, onChange: onPwChange, onBlur, hasTypedSamePasswords, resetPasswordChangeForm } = usePasswordChange();
    const [currentPassword, setCurrentPassword] = useState("");
    const { uploading, statusHandler } = useRequestStatus();

    async function handlePasswordChange(e) {
        e.preventDefault();
        if (uploading) return;
        statusHandler.toggleUploading();
        const [status, msg,] = await changeOwnPassword({
            current_password: currentPassword,
            password: newPassword?.password,
            confirm_password: newPassword?.confirm_password,
        });
        if (status) updateNotification(status, msg);
        if (status === 200) {
            resetPasswordChangeForm();
            setCurrentPassword("");
            // every session was ended server-side; land on the bare login URL
            setTimeout(() => {
                window.history.replaceState(null, '', '/superadmin');
                window.location.reload();
            }, afterChangeExitTime);
            return;
        }
        statusHandler.toggleUploading();
    }

    return (
        <form onSubmit={handlePasswordChange}>
            <Section title={"Change my password"}>
                <TextInput value={user?.username} onChange={() => null} input={{
                    name: 'username', label: 'Username', readOnly: true
                }} />
                <PasswordInput value={currentPassword} onChange={({ value }) => setCurrentPassword(value)} input={{
                    name: 'current_password', label: 'Current password'
                }} />
            </Section>
            <Section>
                <PasswordInput value={newPassword?.password} error={errors?.password} onChange={onPwChange} onBlur={onBlur} input={{
                    name: 'password', label: 'New password'
                }} />
                <PasswordInput value={newPassword?.confirm_password} error={errors?.confirm_password} onChange={onPwChange} onBlur={onBlur} input={{
                    name: 'confirm_password', label: 'Confirm password'
                }} />
            </Section>
            <ButtonsSecion>
                <FormSaveButton disabled={!currentPassword || !hasTypedSamePasswords() || Object.keys(errors).length > 0 || uploading}
                    custom={[uploading, "Change password", "Updating..."]} />
            </ButtonsSecion>
        </form>
    );
}

export default MyPassword;
