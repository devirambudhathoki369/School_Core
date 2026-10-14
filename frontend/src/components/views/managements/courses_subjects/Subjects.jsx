import { confirmAction } from "@/components/ConfirmDialog";
import { SelectInput, TextInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import { Button, Tooltip } from "@material-tailwind/react";
import BasicTable from "@/components/tables/BasicTable";
import SubjectsProvider, { useSubjects } from "@/contexts/SubjectsContext";
import { editAction, deleteAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";

// SEE INFORMATION on backend/main/models/Subject.py
const SUBJECT_TYPES = [
    { name: "compulsory", value: 1 },
    { name: "optional", value: 2 },
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
                    <ButtonsSecion>
                        <Tooltip content={"Is subject divided as th and pr? Eg : English (Th) and English (Pr)."}>
                            <Button variant="outlined" onClick={togglePartition}>Toggle - Subject (Th/Pr Split)</Button>
                        </Tooltip>
                    </ButtonsSecion>
                    <Section title={partitioned ? "New Partitioned Subject" : "New Subject"}>
                        <>
                            <>
                                <SelectInput input={{ name: 'type', label: 'Subject type', options: SUBJECT_TYPES }}
                                    value={form?.type} error={errors?.type} onChange={onChange} onBlur={onBlur} />
                                <TextInput input={{ name: 'order', label: "Subject's order", type: "number" }}
                                    value={form?.order} error={errors?.order} onChange={onChange} onBlur={onBlur} />
                                <div className="hidden sm:block sm:col-span-4"></div>
                            </>
                            <>
                                <>
                                    <>
                                        <TextInput input={{
                                            name: 'code',
                                            label: `Subject code ${partitioned ? '(Theory)' : ''}`
                                        }} value={form?.code}
                                            error={errors?.code} onChange={onChange} onBlur={onBlur} />
                                        <TextInput input={{
                                            name: 'subject',
                                            label: `Subject name ${partitioned ? '(Theory)' : ''}`
                                        }} value={form?.subject}
                                            error={errors?.subject} onChange={onChange} onBlur={onBlur} />
                                        <TextInput input={{
                                            name: 'credit_hours',
                                            label: `Credit hours ${partitioned ? '(Theory)' : ''}`
                                        }} value={form?.credit_hours}
                                            error={errors?.credit_hours} onChange={onChange} onBlur={onBlur} />
                                    </>
                                    {partitioned &&
                                        <>
                                            <TextInput input={{ name: 'code_pr', label: 'Subject code (Practical)' }} value={form?.code_pr || ''}
                                                error={errors?.code_pr} onChange={onChange} onBlur={onBlur} />
                                            <TextInput input={{ name: 'subject_pr', label: 'Subject name (Practical)' }} value={form?.subject_pr || ''}
                                                error={errors?.subject_pr} onChange={onChange} onBlur={onBlur} />
                                            <TextInput input={{ name: 'credit_hours_pr', label: 'Credit hours  (Practical)' }} value={form?.credit_hours_pr || ''}
                                                error={errors?.credit_hours_pr} onChange={onChange} onBlur={onBlur} />
                                        </>
                                    }
                                </>
                            </>
                        </>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={status.uploading} disabled={!classId} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {
                    (!status.feching && subjects?.[classId]?.length > 0) ?
                        <BasicTable key={classId} name={"Subjects"} columns={[
                            ['type_str', 'type'],
                            ['code', 'subject code (th.)'],
                            ['subject', 'subject (th.)'],
                            ['code_pr', 'subject code (pr.)'],
                            ['subject_pr', 'subject (pr.)'],
                            ['order', "Subject's order", 'Subject\'s order for marksheet'],
                            ['credit_hours', 'credit hours (th.)'],
                            ['credit_hours_pr', 'credit hours (pr.)'],
                        ]} onSelect={(action, id) => {
                            // Delete is a SAFE soft-remove (see confirmDelete): the
                            // subject is hidden + unlinked from the current routine,
                            // but closed-year marksheets are preserved.
                            if (action === editAction.action) onEdit(id);
                            else if (action === deleteAction.action) confirmDelete(id);
                            else return null;
                        }} data={subjects[classId]} actions={[editAction, deleteAction]} /> :
                        <Loader />
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