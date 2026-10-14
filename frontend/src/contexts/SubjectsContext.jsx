import { createContext, useContext, useEffect, useState } from "react";
import subjectSchema from "@/schemas/subject";
import subjectValidationSchema, { commonValidations } from "@/schemas/validations/subject";
import { useAppContext } from "./AppContext";
import { fetchSubjects, saveSubject, deleteSubject } from "@/services/functions/subjects";
import { object } from "yup";
import useRequestStatus from "@/hooks/requestStatus";

const SubjectsContext = createContext({})

export function useSubjects() {
    return useContext(SubjectsContext);
}

let validationSchema = object(subjectValidationSchema);
export default function SubjectsProvider({ children, classId = null }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    subjectSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...subjectSchema, class_info: classId }));
    const [errors, setErrors] = useState([]);
    const [partitioned, setPartitioned] = useState(false);
    // 
    const [subjects, setSubjects] = useState({});
    const { fetching, uploading, statusHandler } = useRequestStatus();
    // 
    function togglePartition(newState = null) {
        setPartitioned(state => {
            const ns = typeof (newState) === "boolean" ? newState : !state;
            if (!ns) {
                resetPracticals();
                validationSchema = object(subjectValidationSchema);
            } else {
                validationSchema = object({
                    ...subjectValidationSchema,
                    code_pr: commonValidations.code,
                    subject_pr: commonValidations.subject,
                    credit_hours_pr: commonValidations.credit_hours,
                });
            }
            return ns;
        });
    }
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await validationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await validationSchema.validate(form);
            const [status, message, data] = await saveSubject(form);
            updateNotification(status, message);
            if (status === 200) {
                // else set at key null which will be all old subjects; later null will be removed!
                // after update;
                if (form?.id) {
                    const { id, type, order, code, subject, credit_hours, code_pr, subject_pr, credit_hours_pr } = form;
                    setSubjects(state => {
                        const _subjects = { ...state };
                        _subjects[classId || null] = (_subjects?.[classId || null] || [])
                            .map(item =>
                                item.id === form.id ?
                                    {
                                        ...item, id, type, type_str: form?.type === 1 ? "compulsory" : "optional",
                                        order, code, subject, credit_hours, code_pr, subject_pr, credit_hours_pr
                                    }
                                    : item
                            );
                        return _subjects;
                    });
                } else if (data?.subject?.id) {
                    // after new entry;
                    setSubjects(state => {
                        const _subjects = { ...state };
                        _subjects[classId || null] = [
                            {
                                id: data.subject.id, ...form,
                                type_str: form?.type === 1 ? "compulsory" : "optional"
                            },
                            ...(_subjects?.[classId || null] || [])
                        ];
                        return _subjects;
                    });
                }
                resetForm();
            }
        } catch (e) {
            // alert(e.message);
            updateNotification('', e.message);
        }
        statusHandler.toggleUploading();
    }
    async function onEdit(id) {
        // alert(`Editing ${id}`);
        // handle class-id, not-needed cause no need to update class;
        const item = (subjects?.[classId || null] || []).reduce((acc, _subject) => {
            if (_subject.id === id) {
                const { type, order, code, subject, credit_hours, code_pr, subject_pr, credit_hours_pr } = _subject;
                if (subject_pr && credit_hours_pr) {
                    togglePartition(true);
                } else {
                    togglePartition(false);
                }
                acc = { ...subjectSchema, id, type, order, code, subject, credit_hours, code_pr, subject_pr, credit_hours_pr };
            }
            return acc;
        }, {});
        setForm(item);
    }
    async function onDelete(id) {
        const [status, message, _] = await deleteSubject(id, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setSubjects(state => {
                const _subjects = { ...state };
                _subjects[classId || null] = (_subjects?.[classId || null] || []).filter(item => item.id != id);
                return _subjects;
            });
        }
    }
    function resetForm() {
        setForm({ ...subjectSchema, class_info: classId });
        setErrors({});
    }
    function resetPracticals() {
        setForm(state => {
            state = ({ ...state, code_pr: '', subject_pr: '', credit_hours_pr: '' });
            return state;
        });
    }
    // 
    useEffect(() => {
        if (classId && !subjects?.[classId || null]) {
            (async () => {
                statusHandler.toggleFetching();
                let data = await fetchSubjects(user?.profile?.school || user?.profile?.id, '', '', '', classId);
                data = data.map((item) => {
                    return { ...item, "type_str": item.type === 1 ? "Compulsory" : "Optional" };
                });
                setSubjects(state => ({ ...state, [classId || null]: data }));
                statusHandler.toggleFetching();
            })();
        }
        setForm(state => ({ ...state, class_info: classId }));
    }, [classId]);
    // 
    return (
        <SubjectsContext.Provider value={{
            data: { partitioned, subjects, form, errors },
            methods: { togglePartition, onChange, onBlur, onSave, onEdit, onDelete, resetForm, resetPracticals },
            status: { fetching, uploading, statusHandler }
        }}>
            {children}
        </SubjectsContext.Provider>
    )
}