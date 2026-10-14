import { TextInput } from "@/components/inputs";
import BlogEditor from "@/components/inputs/BlogEditor";
import { useAppContext } from "@/contexts/AppContext";
import { __save, __update } from "@/services/functions";
import { useState } from "react";
import { NEWS_EVENTS_API_PATH } from "./configs";
import { formatImagePath } from "@/methods/formatMediaPath";
import { ButtonsSecion } from "@/components/sections";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";

const schema = { title: "", content: "", school: "" };
function NewsEventsForm() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const schoolId = user?.profile?.school || user?.profile?.id;
    schema["school"] = schoolId;
    const [data, setData] = useState({ ...schema });
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setData(state => ({ ...state, [name]: value }));
    }

    async function uploadImage(imageFile) {
        const formData = new FormData();
        formData.append("school", schoolId);
        formData.append("image", imageFile);
        const [, , res] = await __update(NEWS_EVENTS_API_PATH, formData);
        if (res?.image) {
            return formatImagePath(res.image);
        }
        return "";
    }

    async function saveNewsEvent(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const [status, msg, res] = await __save(NEWS_EVENTS_API_PATH, data);
        updateNotification(status, msg);
        if (status === 200) {
            resetEditor();
        }
        statusHandler.toggleUploading();
    }

    function resetEditor() {
        setData({ ...schema });
    }

    return (
        <div className="w-4xl max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold leading-7 text-gray-900 mb-4">Write news or events blog</h1>

            <form onSubmit={saveNewsEvent}>
                <TextInput input={{ name: 'title', label: "Title" }} value={data?.title} onChange={onChange} />
                <BlogEditor content={data?.content} onChange={(value) => {
                    onChange({ name: "content", value });
                }} onFileInsert={uploadImage} />
                <ButtonsSecion>
                    <FormSaveButton saving={uploading} />
                </ButtonsSecion>
            </form>
        </div>
    )
}

export default NewsEventsForm;