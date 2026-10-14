import NotFound from "@/components/NotFound";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SearchInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { editAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { examSchema } from "@/schemas/exam";
import examValidationSchema from "@/schemas/validations/exams/exam";
import { fetchExams, saveExam } from "@/services/functions/exams/exam";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
import Checkbox from "@/components/inputs/Checkbox";
import AcademicYearNotice from "@/components/AcademicYearNotice";

function ManageExams() {
    const { user: { user }, notification: { updateNotification }, fiscalYear: { years, year } } = useAppContext();
    examSchema["school"] = user?.profile?.school || user?.profile?.id;
    examSchema["academic_year"] = year?.academic_year;
    const [form, setForm] = useState(() => ({ ...examSchema }));
    const [errors, setErrors] = useState({});
    const [selectedAcademicYear, setSelectedAcademicYear] = useState(year?.academic_year);
    const [exams, setExams] = useState({});
    const { fetching, uploading, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    function onAcademicYearSelect({ name, value }) {
        setSelectedAcademicYear(value);
    }
    async function onBlur({ name, value }) {
        try {
            await examValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    async function onSave(e) {
        e.preventDefault();
        try {
            statusHandler.toggleUploading();
            await examValidationSchema.validate(form);
            const [status, message, data] = await saveExam(form, false);
            updateNotification(status, message);
            if (status === 200) {
                // after new entry or update!;
                if (data?.exam) {
                    if (form?.id) {
                        // update;
                        setExams(state => {
                            const ns = { ...state };
                            let acay = data.exam.academic_year;
                            if (acay != selectedAcademicYear) {
                                // academic year was changed!
                                // remove from old academic-year-exam-list!
                                ns[selectedAcademicYear] = [...ns[selectedAcademicYear].filter(item => item.id != form.id)];
                                // insert into new academic-year-exam-list!
                                ns[acay] = [data.exam, ...(ns?.[acay] || [])];
                            } else {
                                // just make an update!
                                ns[acay] = [...(ns?.[acay] || []).map(item => item.id === form.id ? data.exam : item)];
                            }
                            return ns;
                        });
                    } else {
                        // new entry;
                        setExams(state => {
                            const ns = { ...state };
                            const acay = data.exam.academic_year;
                            ns[acay] = [data.exam, ...(ns?.[acay] || [])];
                            return ns;
                        });
                    }
                }
                setForm({ ...examSchema });
            }
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    function onReset() {
        setForm({ ...examSchema });
    }
    // 
    async function onEdit(id) {
        // alert(`Editing ${id}`);
        const item = (exams?.[selectedAcademicYear] || []).reduce((acc, _exam) => {
            if (_exam.id === id) {
                const { academic_year, name, inclusion } = _exam;
                acc = { id, academic_year, name, inclusion };
            }
            return acc;
        }, {});
        setForm({ ...examSchema, ...item });
    }
    // 
    useEffect(() => {
        if (selectedAcademicYear && !exams?.[selectedAcademicYear]) {
            (async () => {
                statusHandler.toggleFetching();
                let data = await fetchExams(user?.profile?.school || user?.profile?.id, selectedAcademicYear);
                data = data.map(e => ({ ...e, "attendance_inclusion_str": e?.attendance_inclusion ? "Yes" : "No" }));
                setExams(state => ({ ...state, [selectedAcademicYear]: data }));
                statusHandler.toggleFetching();
            })();
        }
    }, [user?.profile, selectedAcademicYear]);
    return (
        <>
            <AcademicYearNotice />
            <form onSubmit={onSave}>
                <Section>
                    <SearchInput value={form?.academic_year} error={errors?.academic_year}
                        onChange={onChange} onBlur={onBlur}
                        input={{ name: 'academic_year', label: 'Academic Year', options: years?.academicYears || [] }} />
                    <TextInput value={form?.name} error={errors?.name} onChange={onChange} onBlur={onBlur}
                        input={{ name: 'name', label: 'Name' }} />
                    <TextInput value={form?.inclusion} error={errors?.inclusion} onChange={onChange} onBlur={onBlur}
                        input={{ name: 'inclusion', label: 'Inclusion (%)' }} />
                    <Checkbox name={"attendance_inclusion"} text={"Attendance Inclusion"} description={"Include attendance in final result"}
                        checked={form?.attendance_inclusion} onClick={() => {
                            onChange({ name: "attendance_inclusion", value: !form?.attendance_inclusion })
                        }} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton saving={uploading} isUpdate={form?.id} />
                </ButtonsSecion>
            </form>
            {/*  */}
            <BasicTable name={"Exams"} columns={[
                ['name'], ['academic_year_str', 'Academic year'], ['inclusion'], ['attendance_inclusion_str', "Attendance Inclusion"]
            ]} data={exams?.[selectedAcademicYear] || []} loading={fetching}
                actions={[editAction]}
                onSelect={(action, id) => {
                    if (action === editAction.action) onEdit(id);
                    else return null;
                }} header={
                    <Section description={"Change inputs below to see exams list!"}>
                        <SearchInput input={{ name: "selected_academic_year", label: "Academic Year", options: years?.academicYears || [], readOnly: uploading || form?.id }}
                            value={selectedAcademicYear} onChange={onAcademicYearSelect} info={form?.id ? "Cannot change while updating!" : ""} />
                    </Section>
                } footer={
                    <>
                        {exams?.[selectedAcademicYear]?.length < 1 &&
                            <NotFound error={`No exams found for academic year ${year?.academic_year_name}`.toUpperCase()} />
                        }
                    </>
                } />
        </>
    )
}

export default ManageExams;