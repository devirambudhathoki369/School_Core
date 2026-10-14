import FormSaveButton from "@/components/buttons/FormSaveButton";
import { ButtonsSecion } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchExtraActivities, saveExtraActivities } from "@/services/functions/exams/extraActivities";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const extraActivitySchema = { index: '', name: '' };
function ManageExtraActivities() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [activities, setActivities] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();
    const [uploadedActivities, setUploadedActivities] = useState([]); // db data;

    function addNewActivity() {
        setActivities(state => {
            const ns = [...state, { ...extraActivitySchema, index: state.length }];
            return ns;
        });
    }
    function deleteActivity(key, item) {
        setActivities(state => {
            const ns = [...state].filter(e => e[key] !== item[key]);
            return ns;
        });
    }
    function onChange(index, col, value) {
        setActivities(state => {
            const ns = [...state];
            ns[index] = { ...ns[index], [col]: value };
            return ns;
        });
    }
    function onReset() {
        setActivities([]);
    }
    function onExtraActivityActionClicked(action, id, item) {
        if (action === editAction.action) {
            setActivities([{ ...item, index: activities?.length || 0 }]);
        }
    }
    function updateLocalData(data) {
        const updates = data.reduce((acc, val) => {
            acc[val.id] = val;
            return acc;
        }, {});
        setUploadedActivities(state => {
            let ns = [...data, ...state.filter(e => !updates?.[e.id])]
            return ns;
        });
    }
    function prepareAndValidate(data) {
        const schoolId = user?.profile?.school || user?.profile?.id;
        data = data.reduce((acc, val) => {
            const { index, ...reqData } = val;
            if (reqData?.name) {
                acc.push({ ...reqData, school: schoolId });
            }
            return acc;
        }, []);
        return data.length > 0 ? data : null;
    }
    async function uploadExtraActivities(e) {
        e.preventDefault();
        const uploadData = prepareAndValidate(activities);
        // console.log(uploadData);
        // return;
        if (uploadData) {
            statusHandler.toggleUploading();
            const [status, message, res] = await saveExtraActivities(uploadData);
            updateNotification(status, message);
            if (status === 200) {
                if (res?.data && res?.data?.length > 0) {
                    updateLocalData(res.data);
                }
                onReset();
            }
            statusHandler.toggleUploading();
        } else {
            updateNotification(400, "Invalid data!");
        }
    }
    useEffect(() => {
        (async () => {
            const schoolId = user?.profile?.school || user?.profile?.id;
            const res = await fetchExtraActivities(schoolId);
            setUploadedActivities(res);
        })();
    }, []);
    // 
    return (
        <>
            <form onSubmit={uploadExtraActivities}>
                <BasicTable name={"Extra Activities Setup"} data={activities}
                    columns={[['name']]} editable={true} editableColumns={[['name']]}
                    actions={[deleteAction]}
                    onSelect={(action, _, item) => {
                        const KEY = item?.id ? "id" : "index";
                        if (action === deleteAction.action) deleteActivity(KEY, item);
                    }}
                    showSelected={false}
                    onChange={onChange} onBlur={() => null}
                    onShortcut={({ ctrlKey, key }) => {
                        if (ctrlKey && key === "enter") {
                            addNewActivity();
                        }
                    }}
                    footer={
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={addNewActivity}>New activity</Button>
                        </ButtonsSecion>
                    } />
                <ButtonsSecion>
                    <FormSaveButton isUpdate={activities?.[0]?.id} saving={uploading} disabled={activities?.length < 1} />
                </ButtonsSecion>
            </form>
            <div className="mt-3">
                <BasicTable name={"Extra activities"} data={uploadedActivities}
                    columns={[['name']]} actions={[editAction]}
                    onSelect={onExtraActivityActionClicked} showSelected={false} />
            </div>
        </>
    )
}

export default ManageExtraActivities;