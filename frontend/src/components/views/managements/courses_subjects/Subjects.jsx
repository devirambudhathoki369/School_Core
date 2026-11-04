import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import { Button } from "@material-tailwind/react";
import BasicTable from "@/components/tables/BasicTable";
import SubjectsProvider, { useSubjects } from "@/contexts/SubjectsContext";
import { editAction, deleteAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";

// SEE INFORMATION on backend/main/models/Subject.py
const SUBJECT_TYPES = [
    { name: "Compulsory", value: 1 },
    { name: "Optional", value: 2 },
]

function ManageSubjects({ classId }) {
    const { data: { partitioned, form, errors, subjects },
        methods: { togglePartition, onSave, onChange, onBlur, onEdit, onDelete, resetForm },
        status } = useSubjects(); // subjects are already returned classwise from provider!

    async function confirmDelete(id) {
        const row = (subjects?.[classId] || []).find(item => item.id === id);
        const name = row?.subject || "this subject";
        // Guarded delete: the server refuses (409) if the subject is used anywhere
        // (results, homework, exam setups, teacher assignments), so history is never
        // touched. Only an unused subject is actually removed (reversible soft-delete).
        if (!await confirmAction({
            title: `Delete "${name}"?`,
            body: "A subject that has been used anywhere — marks and results, homework, "
                + "exam setup or a teacher assignment — cannot be deleted and will be kept. "
                + "Only an unused subject is removed.",
        })) return;
        onDelete(id);
    }

    return (
        <>
            <>
                <form onSubmit={onSave}>
                    <Section
                        title={form?.id ? "Edit subject" : "Add a subject"}
                        description="Add the subjects taught in this class. Use the Theory + Practical option only when both parts are graded separately."
                        actions={[
                            <Button key="single" type="button" size="sm"
                                variant={!partitioned ? "filled" : "outlined"}
                                onClick={() => togglePartition(false)}>
                                Single subject
                            </Button>,
                            <Button key="split" type="button" size="sm"
                                variant={partitioned ? "filled" : "outlined"}
                                onClick={() => togglePartition(true)}>
                                Theory + practical
                            </Button>,
                        ]}>
                        <>
                            <>
                                <SelectInput input={{ name: 'type', label: 'Subject type', options: SUBJECT_TYPES, required: true }}
                                    value={form?.type} error={errors?.type} onChange={onChange} onBlur={onBlur} />
                                <TextInput input={{ name: 'order', label: "Marksheet display order", type: "number", required: true, placeholder: "Example: 1" }}
                                    value={form?.order} error={errors?.order} info="Controls where this subject appears on marksheets."
                                    onChange={onChange} onBlur={onBlur} />
                                <div className="hidden sm:block sm:col-span-4"></div>
                            </>
                            <>
                                <>
                                    <>
                                        <TextInput input={{
                                            name: 'code',
                                            label: `Subject code ${partitioned ? '(Theory)' : ''}`,
                                            placeholder: 'Example: ENG',
                                        }} value={form?.code}
                                            error={errors?.code} onChange={onChange} onBlur={onBlur} />
                                        <TextInput input={{
                                            name: 'subject',
                                            label: `Subject name ${partitioned ? '(Theory)' : ''}`,
                                            required: true,
                                            placeholder: 'Example: English',
                                        }} value={form?.subject}
                                            error={errors?.subject} onChange={onChange} onBlur={onBlur} />
                                        <TextInput input={{
                                            name: 'credit_hours',
                                            label: `Credit hours ${partitioned ? '(Theory)' : ''}`,
                                            type: 'number', required: true, placeholder: 'Example: 4',
                                        }} value={form?.credit_hours}
                                            error={errors?.credit_hours} onChange={onChange} onBlur={onBlur} />
                                    </>
                                    {partitioned &&
                                        <>
                                            <TextInput input={{ name: 'code_pr', label: 'Subject code (Practical)', placeholder: 'Example: ENG-PR' }} value={form?.code_pr || ''}
                                                error={errors?.code_pr} onChange={onChange} onBlur={onBlur} />
                                            <TextInput input={{ name: 'subject_pr', label: 'Subject name (Practical)', required: true, placeholder: 'Example: English Practical' }} value={form?.subject_pr || ''}
                                                error={errors?.subject_pr} onChange={onChange} onBlur={onBlur} />
                                            <TextInput input={{ name: 'credit_hours_pr', label: 'Credit hours (Practical)', type: 'number', required: true, placeholder: 'Example: 1' }} value={form?.credit_hours_pr || ''}
                                                error={errors?.credit_hours_pr} onChange={onChange} onBlur={onBlur} />
                                        </>
                                    }
                                </>
                            </>
                        </>
                    </Section>
                    <ButtonsSecion>
                        <Button type="button" variant="outlined" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={status.uploading} disabled={!classId} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {
                    status.fetching || !Object.prototype.hasOwnProperty.call(subjects, classId) ? <Loader /> :
                        <BasicTable key={classId} name={"Subjects in this class"} columns={[
                            ['type_str', 'type'],
                            ['code', 'theory code'],
                            ['subject', 'subject / theory'],
                            ['code_pr', 'practical code'],
                            ['subject_pr', 'practical subject'],
                            ['order', "display order", 'Order on marksheets'],
                            ['credit_hours', 'theory credit hours'],
                            ['credit_hours_pr', 'practical credit hours'],
                        ]} onSelect={(action, id) => {
                            // Delete is a SAFE soft-remove (see confirmDelete): the
                            // subject is hidden + unlinked from the current routine,
                            // but closed-year marksheets are preserved.
                            if (action === editAction.action) onEdit(id);
                            else if (action === deleteAction.action) confirmDelete(id);
                            else return null;
                        }} data={subjects[classId] || []} actions={[editAction, deleteAction]} />
                }
            </>
        </>
    )
}

export default function ({ classId }) {
    return (
        <SubjectsProvider classId={classId}>
            <ManageSubjects classId={classId} />
        </SubjectsProvider>
    )
}
