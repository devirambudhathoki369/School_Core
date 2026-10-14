import FormSaveButton from "@/components/buttons/FormSaveButton";
import SeeLogsButton from "@/components/buttons/SeeLogsButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { saveNotice } from "@/services/functions/notice";
import { Textarea } from "@material-tailwind/react";
import { useState } from "react";
import NoticeImagePicker from "./NoticeImagePicker";

const noticeSchema = { school: '', title: '', description: '', date: '', image: null };
function NoticePage() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    noticeSchema["school"] = user?.profile?.school || user?.profile?.id;
    noticeSchema["date"] = user?.today || '';
    const [input, setInput] = useState({ ...noticeSchema });
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setInput(state => ({ ...state, [name]: value }));
    }
    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg,] = await saveNotice(input);
        updateNotification(status, msg);
        if (status === 200) {
            onReset();
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setInput({ ...noticeSchema });
    }

    return (
        <>
            <ButtonsSecion>
                <SeeLogsButton name={"Notices"} href={"admin#app.notices"} />
            </ButtonsSecion>
            <form onSubmit={onSubmit}>
                <Section title={"New notice"}>
                    <TextInput value={input?.date || ''} onChange={onChange} input={{
                        name: 'date', label: "Date"
                    }} />
                    <TextInput value={input?.title} onChange={onChange} input={{
                        name: 'title', label: "Title"
                    }} />
                    <span className="sm:col-span-4" />
                    <div className="sm:col-span-8">
                        <Textarea value={input?.description || ''} name="description" label="Description"
                            onChange={(e) => {
                                const { name, value } = e.target;
                                onChange({ name, value });
                            }} />
                    </div>
                    <NoticeImagePicker
                        value={input.image}
                        onChange={(file) => onChange({ name: 'image', value: file })}
                        onRemove={() => onChange({ name: 'image', value: null })} />
                </Section>
                <ButtonsSecion>
                    <FormSaveButton custom={[uploading, "Publish", "Publishing..."]} />
                </ButtonsSecion>
            </form>
        </>
    )
}

export default NoticePage;