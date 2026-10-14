import { TextInput } from "@/components/inputs";
import { ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { useAppContext } from "@/contexts/AppContext";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import { gradingRulesSchema, ruleSchema } from ".";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchGradingRules, saveGradingRules } from "@/services/functions/exams/gradingRules";
import Loader from "@/components/Loader";

export function GradingRulesForm({ type, name, description }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    gradingRulesSchema['type'] = type;
    gradingRulesSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [data, setData] = useState({ ...gradingRulesSchema });
    const { fetching, uploading, statusHandler } = useRequestStatus();
    // 
    function onChange(index, { name, value }) {
        setData(state => ({
            ...state, 'rules': state.rules.map((item, i) => {
                if (i === index) return { ...item, [name]: value };
                return item;
            })
        }));
    }
    function addAnotherRule() {
        setData(state => ({ ...state, 'rules': [...(state?.rules || []), ruleSchema] }));
    }
    function deleteRule(index) {
        setData(state => ({ ...state, 'rules': (state?.rules || []).filter((_, i) => i !== index) }));
    }
    function checkValidation() {
        try {
            data.rules.forEach((rule) => {
                rule = cleanEmptyFields(rule);
                const dataCount = Object.keys(rule).length;
                if (dataCount < 3) {
                    throw new Error("Invalid data");
                }
            });
            return true;
        } catch ({ message }) {
            updateNotification(500, message);
            return false;
        }
    }
    async function saveRules(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        if (checkValidation()) {
            const [status, message, _data] = await saveGradingRules({ ...data, type });
            updateNotification(status, message);
        }
        statusHandler.toggleUploading();
    }
    //
    useEffect(() => {
        if (user?.profile) {
            statusHandler.toggleFetching();
            (async () => {
                const data = await fetchGradingRules(user?.profile?.school || user?.profile?.id, type);
                if (data?.id) {
                    setData({ ...gradingRulesSchema, ...data });
                }
            })();
            statusHandler.toggleFetching();
        }
    }, [user]);
    //  
    return (
        <div className="border-b border-black my-2 py-2">
            <div className="mb-2">
                <h2 className="text-xl font-semibold leading-7 text-gray-900">{name}</h2>
                <p className="mt-1 text-[0.99rem] leading-5 text-gray-600">{description}</p>
            </div>
            {
                fetching ? <Loader /> :
                    <form onSubmit={saveRules}>
                        {data?.rules?.map((rule, ri) => (
                            <div className="flex items-end gap-x-2" key={ri}>
                                <TextInput input={{ name: 'min', label: 'Minimum', type: 'number' }} value={rule?.min}
                                    onChange={(data) => {
                                        onChange(ri, data);
                                    }} />
                                <TextInput input={{ name: 'max', label: 'Maximum', type: 'number' }} value={rule?.max}
                                    onChange={(data) => {
                                        onChange(ri, data);
                                    }} />
                                <TextInput input={{ name: 'remarks', label: 'Remarks' }} value={rule?.remarks}
                                    onChange={(data) => {
                                        onChange(ri, data);
                                    }} />
                                <Button className="w-max h-max" variant="outlined" size="sm"
                                    onClick={() => {
                                        deleteRule(ri);
                                    }}>
                                    <XMarkIcon className="icon" />
                                </Button>
                            </div>
                        ))}
                        <ButtonsSecion>
                            <Button variant="outlined" onClick={() => { setData([]); }}>Remove all</Button>
                            <Button variant="outlined" onClick={addAnotherRule}>Add Rule</Button>
                            <FormSaveButton saving={uploading} isUpdate={data?.id} disabled={data?.length < 1} />
                        </ButtonsSecion>
                    </form>
            }
        </div>

    );
}
