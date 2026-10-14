import { createContext, useContext, useEffect, useState } from "react";
import courseSchema from "@/schemas/course";
import courseValidationSchema from "@/schemas/validations/course";
import { useAppContext } from "./AppContext";
import { deleteCourse, fetchCourses, saveCourse } from "@/services/functions/courses";
import useRequestStatus from "@/hooks/requestStatus";
import { facultyOptions, options } from "@/components/inputs/options/education";

const CoursesContext = createContext({})

export function useCourses() {
    return useContext(CoursesContext);
}

const EducationLevelMappings = options.reduce((acc, val) => {
    acc[val.value] = val.name;
    return acc;
}, {});
const FacultyMappings = facultyOptions.reduce((acc, val) => {
    acc[val.value] = val.name;
    return acc;
}, {});
const HIGHSCHOOL = 3;
// Only a +2 stream carries a faculty.
const facultyOf = (education_level, faculty) =>
    parseInt(education_level) === HIGHSCHOOL ? (parseInt(faculty) || null) : null;

export default function CoursesProvider({ children }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    courseSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [form, setForm] = useState(() => ({ ...courseSchema }));
    const [errors, setErrors] = useState([]);
    const [courses, setCourses] = useState([]);
    const { uploading, fetching, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await courseValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    async function onSave(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await courseValidationSchema.validate(form);
            const payload = { ...form, faculty: facultyOf(form?.education_level, form?.faculty) };
            const [status, message, _] = await saveCourse(payload);
            updateNotification(status, message);
            if (status === 200) {
                const { education_level, course, faculty } = payload;
                const education_level_str = EducationLevelMappings?.[education_level];
                const faculty_str = FacultyMappings?.[faculty] || "";
                const entry = { education_level, education_level_str, course, faculty, faculty_str };

                if (form?.id) {
                    // after update;
                    setCourses(state =>
                        [...state
                            .map(item =>
                                item.id === form.id ? { ...item, ...entry } : item)
                        ]);
                } else {
                    // after new entry;
                    setCourses(state => [{ ...form, ...entry }, ...state]);
                }
                setForm({ ...courseSchema });
            }
        } catch (e) {
            // alert(e.message);
            updateNotification('', e.message);
        }
        statusHandler.toggleUploading();
    }
    async function onEdit(id) {
        // alert(`Editing ${id}`);
        const item = courses.reduce((acc, _course) => {
            if (_course.id === id) {
                const { education_level, course, faculty } = _course;
                acc = { education_level, course, faculty: faculty || '', id };
            }
            return acc;
        }, {});
        setForm({ ...courseSchema, ...item });
    }
    async function onDelete(id) {
        const [status, message, _] = await deleteCourse(id, user?.profile?.school || user?.profile?.id);
        updateNotification(status, message);
        if (status === 200) {
            setCourses(state => [...state.filter(item => item.id != id)]);
        }
    }
    function resetForm() {
        setForm({ ...courseSchema });
    }
    // 
    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching();
            let data = await fetchCourses(user?.profile?.school || user?.profile?.id);
            data = data.reduce((acc, course) => {
                acc.push({
                    ...course,
                    education_level_str: EducationLevelMappings?.[course?.education_level] || "",
                    // A stream still missing its faculty is offered under none
                    // in the class pickers — flag it so the school sets it.
                    faculty_str: FacultyMappings?.[course?.faculty] ||
                        (parseInt(course?.education_level) === HIGHSCHOOL ? "⚠ not set — edit to pick" : ""),
                });
                return acc;
            }, []).sort((a, b) => a.education_level_str - b.education_level_str);
            setCourses(data);
            statusHandler.toggleFetching();
        })();
    }, []);
    // 
    return (
        <CoursesContext.Provider value={{
            data: { courses, form, errors },
            methods: { onChange, onBlur, onSave, onEdit, onDelete, resetForm },
            status: { fetching, uploading }
        }}>
            {children}
        </CoursesContext.Provider>
    )
}