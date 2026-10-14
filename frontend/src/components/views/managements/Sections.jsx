import BasicTable from "@/components/tables/BasicTable";
import SectionsProvider, { useSections } from "@/contexts/SectionsContext";
import { ButtonsSecion, Section } from "@/components/sections";
import { TextInput } from "@/components/inputs";
import { Button } from "@material-tailwind/react";
import { editAction } from "@/components/tables/actions";
import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";

function ManageSections() {
    const { data: { form, errors, sections },
        methods: { onChange, onBlur, onSave, onEdit, resetForm },
        status: { uploading } } = useSections();
    return (
        <div>
            <>
                <form onSubmit={onSave}>
                    <Section title={"Sections"}>
                        <>
                            <TextInput input={{ name: 'section', label: "Section" }} value={form?.section}
                                error={errors?.section} onChange={onChange} onBlur={onBlur} />
                        </>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={uploading} disabled={uploading} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {sections?.length > 0 ?
                    <BasicTable onSelect={(action, id) => {
                        if (action === editAction.action) onEdit(id);
                    }} name={"Sections"} columns={[
                        ['section']
                    ]} data={sections} actions={[editAction]} /> :
                    <Loader />
                }
            </>
        </div>
    )
}

export default function () {
    return (
        <SectionsProvider>
            <ManageSections />
        </SectionsProvider>
    )
};