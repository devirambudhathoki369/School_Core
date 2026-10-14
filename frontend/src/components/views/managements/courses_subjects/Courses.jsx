import { SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import BasicTable from "@/components/tables/BasicTable";
import CoursesProvider, { useCourses } from "@/contexts/CoursesContext";
import { deleteAction, editAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { facultyOptions, options } from "@/components/inputs/options/education";
import NotFound from "@/components/NotFound";

// Montessori and school (1/2/10) have grades and sections, nothing to name a
// programme. High school (3) is here because +2 faculties split into streams —
// Management ▸ Computer Science / Finance / Business — and a stream is a
// programme row exactly like a college course is.
const _non_allowed_levels = [1, 2, 10];
const HIGHSCHOOL = 3;
const CourseAllowedLevels = options.filter(e => !_non_allowed_levels.includes(e.value));

function ManageCourses() {
    const { data: { form, errors, courses },
        methods: { onSave, onChange, onBlur, onEdit, onDelete, resetForm },
        status: { fetching, uploading } } = useCourses();
    const isHighschool = parseInt(form?.education_level) === HIGHSCHOOL;

    return (
        <>
            <>
                <form onSubmit={onSave}>
                    <Section title={"New Course/Program"}>
                        <>
                            <SelectInput input={{ name: 'education_level', label: "Education Level", options: CourseAllowedLevels }} value={form?.education_level}
                                error={errors?.education_level} onChange={onChange} onBlur={onBlur} />
                            {/* A stream belongs to ONE faculty — the class pickers
                                offer it only under that faculty. */}
                            {isHighschool &&
                                <SelectInput input={{ name: 'faculty', label: "Faculty", options: facultyOptions }} value={form?.faculty}
                                    error={errors?.faculty} onChange={onChange} onBlur={onBlur} />
                            }
                            <TextInput input={{
                                name: 'course',
                                label: isHighschool ? 'Stream' : 'Course',
                                placeholder: isHighschool ? 'Computer Science' : 'Bachelor of Computer Application (BCA)'
                            }} value={form?.course}
                                info={isHighschool
                                    ? 'A stream under the faculty above (Management ▸ Computer Science). It is offered only under that faculty when you set the class up.'
                                    : undefined}
                                error={errors?.course} onChange={onChange} onBlur={onBlur} />
                            {/* +2 runs in grades, not years or semesters, so the
                                program length has nothing to say for a stream. */}
                            {!isHighschool &&
                                <>
                                    <TextInput input={{ name: 'total_years', label: 'Total years', type: 'number', placeholder: 'e.g. 3 (year-wise programs)' }} value={form?.total_years}
                                        info={'Program length — fill this OR total semesters. Used at year-end to know the final (graduating) level.'}
                                        error={errors?.total_years} onChange={onChange} onBlur={onBlur} />
                                    <TextInput input={{ name: 'total_semesters', label: 'Total semesters', type: 'number', placeholder: 'e.g. 8 (semester-wise programs)' }} value={form?.total_semesters}
                                        error={errors?.total_semesters} onChange={onChange} onBlur={onBlur} />
                                </>
                            }
                        </>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={uploading} disabled={uploading} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {
                    courses?.length > 0 ?
                        <BasicTable name={"Courses"} columns={[
                            ['education_level_str', "Education Level"], ['faculty_str', "Faculty"], ['course']
                        ]} onSelect={(action, id) => {
                            if (action === editAction.action) onEdit(id);
                            else if (action === deleteAction.action) onDelete(id);
                            else return null;
                        }} data={courses} actions={[editAction, deleteAction]} /> :
                        <>
                            {
                                fetching ? <Loader /> : <NotFound />
                            }
                        </>
                }
            </>
        </>
    )
}

export default function () {
    return (
        <CoursesProvider>
            <ManageCourses />
        </CoursesProvider>
    )
}