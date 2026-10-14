import { createContext, useContext, useEffect, useState } from "react";
import { useAppContext } from "../AppContext";
import { deleteFee, fetchFees, saveFee } from "@/services/functions/fees";
import { fetchFeeTitles } from "@/services/functions/feeTitles";
import feeSchema from "@/schemas/fee";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import { fetchClassesInOrder } from "@/services/functions/classes";
import cleanClassInfo from "@/methods/cleanClassInfo";
import useRequestStatus from "@/hooks/requestStatus";

const FeesContext = createContext({});

export function useFees() {
    return useContext(FeesContext);
}

const _feeSchema = flattenSchema(feeSchema);
export default function FeesProvider({ children }) {
    const { user: { user },
        fiscalYear: { year },
        notification: { updateNotification } } = useAppContext();
    // 
    _feeSchema['school'] = user?.profile?.school || user?.profile?.id;
    _feeSchema['academic_year'] = year?.academic_year;
    const [form, setForm] = useState(() => ({ ..._feeSchema }));
    // 
    const [titles, setTitles] = useState([]);
    const [fees, setFees] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();
    // 
    /**
     * when this receives feeData, it adds/updates it in fees.data;
     */
    function getFeeIndex(cid, id) {
        return (fees?.fees?.[cid] || []).reduce((acc, val, index) => {
            if (val[0] === id) acc = index;
            return acc;
        }, -1);
    }
    function getClassIndex(cid) {
        return (fees?.classes || []).reduce((acc, val, index) => {
            if (val[1].id === cid) acc = index;
            return acc;
        }, -1);
    }
    function updateFees(feeData) {
        const _s = { ...fees };
        const { id, class_info: { id: cid }, title_id, classname, fee } = feeData;
        // 
        if (_s['fees']?.[cid]) {
            const feeIndex = getFeeIndex(cid, id); // if fee already exists, case for update;
            // console.log(feeIndex);
            if (feeIndex >= 0) {
                _s['fees'][cid][feeIndex] = [id, title_id, fee];
            } else {
                _s['fees'][cid].push([id, title_id, fee]);
            }
        } else {
            _s['fees'][cid] = [[id, title_id, fee]];
        }
        // 
        const clsIndex = getClassIndex(cid);
        if (clsIndex >= 0) {
            _s['classes'][clsIndex][2] = parseInt((_s['classes'][clsIndex]?.[2] || 0)) + 1;
        } else {
            _s['classes'].push(_s.classes?.[clsIndex] || [classname, feeData?.class_info || {}, 1]);
        }
        setFees(_s);
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            const uploadData = fillData(feeSchema, form);
            uploadData["class_info"] = cleanClassInfo(uploadData?.class_info || {});
            // TODO : validate data;
            form?.id && (uploadData['id'] = form.id);
            // console.log(uploadData);
            // return null;
            const [status, message, data] = await saveFee(uploadData, form?.id ? false : true);
            // updates fees with recently added data;
            updateNotification(status, message);
            if (status === 200) {
                if (data?.fee) {
                    // on new entry;
                    updateFees(data.fee);
                    setForm({ ...form, title: '', fee: '', id: null }); // soft reset;
                } else if (form?.id) {
                    // on update;
                    // console.log(data);
                    data?.update && (updateFees(data.update));
                    setForm({ ..._feeSchema });
                }
            }
        } catch ({ message }) {
            updateNotification(400, message);
        }
        statusHandler.toggleUploading();
    }
    function onEdit(fee) {
        setForm({ ..._feeSchema, ...fee });
    }
    async function onDelete(classId, feeIndex, feeId) {
        const [status, message, _] = await deleteFee(feeId, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            const _s = { ...fees };
            _s['data'][classId].splice(feeIndex, 1);
            if (_s['data'][classId]?.length < 1) {
                delete _s['data'][classId];
            }
            setFees(_s);
        }
    }
    function resetForm() {
        setForm({ ..._feeSchema });
    }
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    function onBlur() {
    }
    // 
    function getTitleMappings(titles) {
        const data = {};
        for (let title of titles) {
            data[title.value] = title.name;
        }
        return data;
    }
    async function getFeesByClassId(class_info_id) {
        const data = await fetchFees(user?.profile?.school || user?.profile?.id, class_info_id);
        setFees(state => ({ ...state, fees: { ...state.fees, [class_info_id]: data } }));
    }
    useEffect(() => {
        (async () => {
            const _classes = await fetchClassesInOrder(user, true);
            const _titles = await fetchFeeTitles(user?.profile?.school || user?.profile?.id, true);
            const _fees = {};
            setTitles(_titles);
            _fees["titles"] = getTitleMappings(_titles);
            _fees["classes"] = _classes;
            _fees["fees"] = {};
            setFees(_fees);
            // 
        })();
    }, [])
    return (
        <FeesContext.Provider value={{
            data: { titles, fees, form },
            methods: { getFeesByClassId, setForm, onSave, onChange, onBlur, resetForm, onEdit, onDelete },
            status: { uploading }
        }}>
            {children}
        </FeesContext.Provider>
    )
}