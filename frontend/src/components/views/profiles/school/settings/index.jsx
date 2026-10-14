import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import usePasswordChange from "@/hooks/passwordChange";
import useRequestStatus from "@/hooks/requestStatus";
import changePassword from "@/services/functions/auth/change_password";
import logout from "@/services/functions/auth/logout";
import { useState } from "react";
import Accordion from "@/components/Accordion";
import Checkbox from "@/components/inputs/Checkbox";
import generalSettingsSchema,
{ AUTO_SEND_ABSENT_SMS, AUTO_SEND_BIRTHDAY_WISH, AUTO_SEND_STAFF_BIRTHDAY_WISH, SMS_ON_BILL_PAYMENT } from "./generalSettingsSchema";
import { updateSchool } from "@/services/functions/schools";

function SchoolSettingsPage() {
    const { user: { user, setUser }, notification: { updateNotification } } = useAppContext();
    // general settings
    const [settings, setSettings] = useState({ ...generalSettingsSchema, ...user?.profile?.preferences });
    // account settings
    const { newPassword, errors, onChange: onPwChange, onBlur, hasTypedSamePasswords, resetPasswordChangeForm } = usePasswordChange();
    const { uploading, statusHandler } = useRequestStatus();

    function onSettingsChange({ name, value }) {
        setSettings(state => ({ ...state, [name]: value }));
    }

    async function handlePasswordChange(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg,] = await changePassword("admin", user?.profile?.account, newPassword);
        updateNotification(status, msg);
        if (status === 200) {
            resetPasswordChangeForm();
            /*
            After password change, every session's token is deleted internally
            (that is the point of changing it), so there is nothing to log out
            of — just land back on the bare login URL. It used to jump to
            `/admin#${HOMEPAGE}`, and that fragment survived the re-login, so a
            HOMEPAGE that did not match a view key dropped the user on a dead
            page. With no fragment the portal resolves its own default view
            instead, whatever HOMEPAGE happens to be set to.
            */
            setTimeout(() => {
                window.history.replaceState(null, '', '/admin');
                window.location.reload();
            }, afterCloseExitTime);
        }
        statusHandler.toggleUploading();
    }

    async function handleUpdateSettings(e) {
        e.preventDefault();
        const uploadData = {
            id: user?.profile?.school || user?.profile?.id,
            preferences: settings,
        };
        statusHandler.toggleUploading();
        const [status, msg, response] = await updateSchool(uploadData);
        updateNotification(status, msg);
        if (status === 200) {
            const { id, ..._settings } = settings;
            setUser(state => {
                const ns = { ...state };
                const preferences = ns?.profile?.preferences || {};
                ns["profile"]["preferences"] = { ...preferences, ..._settings };
                return ns;
            });
        }
        statusHandler.toggleUploading();
    }

    return (
        <>
            <Accordion title="Account Settings">
                <>
                    <Section title={"Change password"}>
                        <TextInput value={user?.username} onChange={() => null} input={{
                            name: 'username', label: 'Username', readOnly: true
                        }} />
                    </Section>
                    <form onSubmit={handlePasswordChange}>
                        <Section>
                            <PasswordInput value={newPassword?.password} error={errors?.password} onChange={onPwChange} onBlur={onBlur} input={{
                                name: 'password', label: 'New password'
                            }} />
                            <PasswordInput value={newPassword?.confirm_password} error={errors?.confirm_password} onChange={onPwChange} onBlur={onBlur} input={{
                                name: 'confirm_password', label: 'Confirm password'
                            }} />
                        </Section>
                        <ButtonsSecion>
                            <FormSaveButton disabled={!hasTypedSamePasswords() || uploading}
                                custom={[uploading, "Change password", "Updating..."]} />
                        </ButtonsSecion>
                    </form>
                </>
            </Accordion>
            <Accordion title={"SMS and Notification Settings"}>
                <form onSubmit={handleUpdateSettings}>
                    {/* send sms on student bill paid */}
                    <div className="!w-full">
                        <Checkbox name={SMS_ON_BILL_PAYMENT} checked={settings?.sms_on_bill_payment}
                            text={"SMS Notification on Bill Payment"}
                            description={"Automatically sends a text message to customers when their bill is paid."}
                            onClick={() => {
                                const name = SMS_ON_BILL_PAYMENT,
                                    value = !settings.sms_on_bill_payment;
                                onSettingsChange({ name, value });
                            }} />
                    </div>
                    {/* auto sms birthday wish */}
                    <div className="!w-full">
                        <Checkbox name={AUTO_SEND_BIRTHDAY_WISH} checked={settings?.birthday_sms_auto_wish}
                            text={"Birthday SMS Wishes"}
                            description={"Automatically sends a birthday greeting via SMS."}
                            onClick={() => {
                                const name = AUTO_SEND_BIRTHDAY_WISH,
                                    value = !settings.birthday_sms_auto_wish;
                                onSettingsChange({ name, value });
                            }} />
                    </div>
                    {/* auto sms birthday wish — teachers and other staff */}
                    <div className="!w-full">
                        <Checkbox name={AUTO_SEND_STAFF_BIRTHDAY_WISH} checked={settings?.staff_birthday_sms_auto_wish}
                            text={"Staff Birthday SMS Wishes"}
                            description={"Automatically sends a birthday greeting to teachers and other staff, on their own number. Write the wording under SMS Templates ▸ Staff Birthday Wish SMS Template."}
                            onClick={() => {
                                const name = AUTO_SEND_STAFF_BIRTHDAY_WISH,
                                    value = !settings.staff_birthday_sms_auto_wish;
                                onSettingsChange({ name, value });
                            }} />
                    </div>
                    {/* auto send sms if student is absent */}
                    <div className="!w-full">
                        <Checkbox name={AUTO_SEND_ABSENT_SMS} checked={settings?.sms_on_absences}
                            text={"Automatic SMS for Absences"}
                            description={"Sends an SMS automatically when a student is absent."}
                            onClick={() => {
                                const name = AUTO_SEND_ABSENT_SMS,
                                    value = !settings.sms_on_absences;
                                onSettingsChange({ name, value });
                            }} />
                    </div>
                    <ButtonsSecion>
                        <FormSaveButton isUpdate={true} saving={uploading} />
                    </ButtonsSecion>
                </form>
            </Accordion>
        </>
    )
}

const afterCloseExitTime = 2 * 1000; // after 2 seconds!

export default SchoolSettingsPage;