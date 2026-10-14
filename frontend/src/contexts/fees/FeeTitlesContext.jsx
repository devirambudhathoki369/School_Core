import { createContext, useContext, useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import { deleteFeeTitle, fetchFeeTitles, saveFeeTitle } from "@/services/functions/feeTitles";
import monthsMapper from "@/methods/monthsMapper";
import useRequestStatus from "@/hooks/requestStatus";

const FeeTitlesContext = createContext({});

export function useFeeTitles() {
    return useContext(FeeTitlesContext);
}

const feeTitleSchema = {
    school: '',
    title: '', months: [],
}
export default function FeeTitlesProvider({ children }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    // 
    feeTitleSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...feeTitleSchema }));
    const [pickedAllMonths, setPickedAllMonths] = useState(false);
    const [titles, setTitles] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();
    // 
    function resetForm() {
        setForm({ ...feeTitleSchema });
        setPickedAllMonths(false);
    }
    function isValid(data) {
        if (data?.school && data?.title) return true;
        return false;
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const uploadData = { ...form, months: form.months };
        if (!isValid(uploadData)) {
            updateNotification('', "Invalid input!");
            return null;
        }
        try {
            // await schema.validate(form);
            const [status, message, data] = await saveFeeTitle(uploadData);
            updateNotification(status, message);
            if (status === 200) {
                if (data?.title) {
                    data['title']['detailed_months'] = monthsMapper(data.title?.months || []);
                    setTitles(state => ([data.title, ...state]));
                }
                else if (form?.id) {
                    const _titles = titles.reduce((acc, val) => {
                        if (val.id === form.id) {
                            const { school, ...updated } = form;
                            updated['detailed_months'] = monthsMapper(updated?.months || []);
                            acc.push(updated);
                        } else acc.push(val);
                        return acc;
                    }, []);
                    // console.log(_titles);
                    setTitles(_titles);
                }
            }
            resetForm();
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    function onChange({ name, value }) {
        if (name === 'month') {
            setForm(state => ({ ...state, months: value }));
        } else setForm(state => ({ ...state, [name]: value }));
    }
    function onSelectAll(months) {
        setForm(state => ({ ...state, months }));
    }
    function onEdit(id) {
        // console.log(titles);
        const selectedItem = titles.reduce((acc, val) => {
            if (val.id === id) {
                const { detailed_months, ...feeTitleDetails } = val;
                acc = feeTitleDetails;
            }
            return acc;
        }, {});
        // console.log({ ...feeTitleSchema, ...selectedItem });
        setForm({ ...feeTitleSchema, ...selectedItem });
    }
    async function onDelete(id) {
        const [status, message, _] = await deleteFeeTitle(id, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setTitles(state => [...state.filter(item => item.id != id)]);
        }
    }
    // 
    useEffect(() => {
        (async () => {
            const data = await fetchFeeTitles(user?.profile?.school || user?.profile?.id);
            data?.map(item => {
                item['detailed_months'] = monthsMapper(item.months);
            });
            setTitles(data);
        })();
    }, []);
    return (
        <FeeTitlesContext.Provider value={{
            data: { titles, form },
            methods: { onChange, onSave, resetForm, onEdit, onDelete },
            months: { pickedAllMonths, setPickedAllMonths, onSelectAll },
            status: { uploading }
        }}>
            {children}
        </FeeTitlesContext.Provider>
    )
}