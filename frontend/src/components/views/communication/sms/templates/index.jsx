import { useEffect, useState } from "react";
import SMSTemplateForm from "./SMSTemplateForm";
import { __fetch } from "@/services/functions";
import { useAppContext } from "@/contexts/AppContext";
import { TEMPLATES_API_PATH, TemplateTypes } from "./configs";


function SMSTemplate() {
    const { user: { user } } = useAppContext();
    const [templates, setTemplates] = useState([]);

    useEffect(() => {
        const schoolId = user?.profile?.school || user?.profile?.id;
        (async () => {
            let _data = await __fetch(TEMPLATES_API_PATH, { school: schoolId });
            if (_data) {
                _data = _data.reduce((acc, template) => {
                    acc[template.type] = template;
                    return acc;
                }, {});
                setTemplates(_data)
            } else {
                setTemplates([]);
            }
        })();
    }, []);

    return (
        <div className="flex flex-col">
            <h2 className="text-xl font-semibold leading-7 text-gray-900 underline mb-2">SMS Templates</h2>
            <SMSTemplateForm template={templates?.[TemplateTypes.DUES]}
                type={TemplateTypes.DUES}
                label={"Fee Remainder SMS Template"} />
            <SMSTemplateForm template={templates?.[TemplateTypes.PAYMENT]}
                type={TemplateTypes.PAYMENT}
                label={"Fee Paid SMS Template"} />
            <SMSTemplateForm template={templates?.[TemplateTypes.RESULT]}
                type={TemplateTypes.RESULT}
                label={"Result SMS Template"} />
            <SMSTemplateForm template={templates?.[TemplateTypes.ATTENDANCE]}
                type={TemplateTypes.ATTENDANCE}
                label={"Attendance SMS Template"} />
            <SMSTemplateForm template={templates?.[TemplateTypes.BIRTHDAY]}
                type={TemplateTypes.BIRTHDAY}
                label={"Birthday Wish SMS Template"}
                help={"Sent to the guardian's number on a student's birthday, once the birthday wish is switched on under Profile ▸ SMS and Notification Settings."} />
            <SMSTemplateForm template={templates?.[TemplateTypes.STAFF_BIRTHDAY]}
                type={TemplateTypes.STAFF_BIRTHDAY}
                label={"Staff Birthday Wish SMS Template"}
                help={"Sent to a teacher's or staff member's own number on their birthday. Needs its own switch under Profile ▸ SMS and Notification Settings."}
                placeholder={"Happy Birthday {{staff-name}}! 🎉 Wishing you a wonderful year ahead. — From all of us at the school."} />
        </div>
    )
}

export default SMSTemplate;