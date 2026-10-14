import { createContext, useContext, useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import { deleteSection, fetchSections, saveSection } from "@/services/functions/sections";
import { object } from "yup";
import { select, text } from "@/schemas/validations";
import useRequestStatus from "@/hooks/requestStatus";

const SectionsContext = createContext({});

export function useSections() {
    return useContext(SectionsContext);
}

const sectionSchema = { section: '', school: '' }
const sectionValidationSchema = object({
    section: text('Section').size(1, 25).must(),
    school: select("School")
})
export default function SectionsProvider({ children }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [sections, setSections] = useState([]);
    sectionSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...sectionSchema }));
    const [errors, setErrors] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await sectionValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await sectionValidationSchema.validate(form);
            const [status, message, data] = await saveSection(form);
            updateNotification(status, message);
            if (status === 200) {
                // after new entry;
                if (data?.section) setSections(state => [data.section, ...state]);
                // after update;
                if (form?.id) {
                    const { section } = form;
                    setSections(state =>
                        [...state
                            .map(item =>
                                item.id === form.id ? { ...item, section } : item)
                        ]);
                }
            }
            setForm({ ...sectionSchema });
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    async function onEdit(id) {
        const item = sections.reduce((acc, _section) => {
            if (_section.id === id) {
                const { section } = _section;
                acc = { section, id };
            }
            return acc;
        }, {});
        setForm({ ...sectionSchema, ...item });
    }
    async function onDelete(id) {
        const [status, message, _] = await deleteSection(id, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setSections(state => [...state.filter(item => item.id != id)]);
        }
    }
    function resetForm() {
        setForm({ ...sectionSchema });
    }
    // 
    useEffect(() => {
        (async () => {
            const data = await fetchSections(user?.profile?.school || user?.profile?.id);
            setSections(data);
        })();
    }, [])
    // 
    return (
        <SectionsContext.Provider value={{
            data: { sections, form, errors },
            methods: { onChange, onBlur, onSave, onEdit, onDelete, resetForm },
            status: { uploading },
        }}>
            {children}
        </SectionsContext.Provider>
    )
}