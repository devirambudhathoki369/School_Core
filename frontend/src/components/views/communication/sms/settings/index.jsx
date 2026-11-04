import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { text } from "@/schemas/validations";
import { __fetch, __update } from "@/services/functions";
import { List } from "@material-tailwind/react";
import { useCallback, useEffect, useState } from "react";
import { object } from "yup";

const smsSettingsSchema = { user: '', role: '', sms_api: '' };
// One unbroken code from the SMS portal. A sentence saved here replaces the real
// key and every SMS the school sends then fails. The server checks this too
// (account/methods/smsKey.py).
const SMS_KEY = /^[A-Za-z0-9._-]{20,100}$/;
const NOT_A_KEY = "This is not an SMS API key. A key is one long code with no spaces, copied from the SMS portal.";
const smsSettingsValidationSchema = object({
    sms_api: text("API Key").must().matches(SMS_KEY, NOT_A_KEY),
});

const ACCOUNT_API_PATH = "/auth/account_update";
const SMS_PORTAL = process.env.NEXT_PUBLIC_SMS_PORTAL,
    SMS_TOKEN_PAGE = process.env.NEXT_PUBLIC_SMS_TOKEN_PAGE;

function SMSSettings() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    smsSettingsSchema["role"] = user?.role;
    smsSettingsSchema["user"] = user?.profile?.account;
    const [data, setData] = useState({ ...smsSettingsSchema });
    const [errors, setErrors] = useState({});
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }
    const onBlur = useCallback(async ({ name, value }) => {
        try {
            await smsSettingsValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }, []);

    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg,] = await __update(ACCOUNT_API_PATH, data);
        updateNotification(status, msg);
        statusHandler.toggleUploading();
    }
    function allowEntry() {
        return (SMS_KEY.test((data?.sms_api || "").trim()) &&
            user?.role === "admin" && user?.profile?.account && !uploading);
    }

    useEffect(() => {
        if (user?.role === "admin") {
            (async () => {
                const res = await __fetch(ACCOUNT_API_PATH, {
                    role: user.role,
                    user: user?.profile?.account,
                    fields: ["sms_api"],
                });
                if (res) {
                    setData(state => ({ ...state, sms_api: res?.sms_api }));
                }
            })();
        }
    }, [user?.profile?.id]);

    return (
        <>
            <form onSubmit={onSave}>
                <Section title={"SMS Settings"}>
                    <TextInput input={{ name: "sms_api", label: "SMS API Key" }} value={data?.sms_api}
                        onChange={onChange} onBlur={onBlur} error={errors?.sms_api}
                        info="Only the code copied from the SMS portal. To send a message, use Bulk SMS." />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton isUpdate={data?.id} saving={uploading} disabled={!allowEntry()} />
                </ButtonsSecion>
            </form>
            {/*  */}
            <h2 className="text-xl font-semibold leading-7 text-gray-900">Help</h2>
            <List>
                <a className="text-blue-600 font-bold underline" href={SMS_PORTAL} target="_blank">
                    Login to SMS portal!
                </a>
                <a className="text-blue-600 font-bold underline" href={SMS_TOKEN_PAGE} target="_blank">
                    Goto SMS Token Page!
                </a>
                <a className="text-blue-600 font-bold">Click "Add Token" if list is empty.</a>
                <List className="">
                    <a className="text-blue-600 font-bold">Change "Status" to "Active".</a>
                    <a className="text-blue-600 font-bold">Change "Follow ip rule" to "No".</a>
                    <a className="text-blue-600 font-bold">Submit.</a>
                </List>
                <a className="text-blue-600 font-bold">Make sure this new token's settings are correct.</a>
                <a className="text-blue-600 font-bold">Copy the Auth Token, Put it above and save!</a>
            </List>
        </>
    )
}

export default SMSSettings;