import FormSaveButton from "@/components/buttons/FormSaveButton";
import { ButtonsSecion } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import { Textarea } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import PlaceValues from "./PlaceValues";
import useRequestStatus from "@/hooks/requestStatus";
import { __save, __update } from "@/services/functions";
import { TEMPLATES_API_PATH } from "./configs";
import SMSLength from "../SMSLength";

const smsTemplateSchema = { school: '', type: '', template: '' };
function SMSTemplateForm({ template, type, label, help, placeholder }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    smsTemplateSchema["school"] = user?.profile?.school || user?.profile?.id;
    smsTemplateSchema["type"] = type;
    const [data, setData] = useState({ ...smsTemplateSchema });
    const [focused, setFocused] = useState(false);
    const { uploading, searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setFocused(true);
        if (name === "placevalue") {
            name = "template";
            value = data.template += `${value}`;
        }
        setData(state => ({ ...state, [name]: value }));
    }

    // Once the message box has been used the place values stay on screen.
    // They used to disappear on blur — and pressing the button below IS a blur:
    // the row vanished, everything under it moved up, and the click landed on
    // empty space instead of the button.
    function onFocus() {
        setFocused(true);
    }

    async function save(apiPath, data) {
        if (data?.id) return __update(apiPath, data);
        return __save(apiPath, data);
    }

    async function saveSMSTemplate(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg,] = await save(TEMPLATES_API_PATH, data);
        updateNotification(status, msg);
        statusHandler.toggleUploading();
    }

    useEffect(() => {
        if (template?.id) {
            setData(state => ({ ...state, ...template }));
        }
    }, [template]);

    return (
        <form onSubmit={saveSMSTemplate} className="mb-2">
            <label htmlFor="template" className="text-base font-bold leading-6 text-gray-900">
                {label}
            </label>
            {help && <p className="mb-1 text-[0.85rem] leading-5 text-gray-600">{help}</p>}
            {
                focused &&
                <PlaceValues onClick={onChange} template_type={type} />
            }
            <Textarea variant="outlined" label={label} name="template" placeholder={placeholder}
                value={data.template} onChange={(e) => {
                    const { name, value } = e.target;
                    onChange({ name, value });
                }} onFocus={onFocus} className="!text-base !text-black" />
            {/* what this message costs, as the SMS provider counts it */}
            <SMSLength text={data.template} placeholders={/\{\{[^{}]+\}\}/.test(data.template || "")} />
            <ButtonsSecion>
                <FormSaveButton saving={uploading} disabled={!data?.school || uploading}
                    isUpdate={data?.id} />
            </ButtonsSecion>
        </form>
    )
}

export default SMSTemplateForm;