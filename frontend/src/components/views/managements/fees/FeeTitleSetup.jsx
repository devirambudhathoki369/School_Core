import Loader from "@/components/Loader";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import MonthPicker from "@/components/inputs/MonthPicker";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction } from "@/components/tables/actions";
import FeeTitlesProvider, { useFeeTitles } from "@/contexts/fees/FeeTitlesContext";
import { Button } from "@material-tailwind/react";

function FeeTitleSetup({ }) {
    const { data: { titles, form },
        methods: { onSave, onChange, resetForm, onEdit, onDelete },
        months: { pickedAllMonths, setPickedAllMonths, onSelectAll },
        status: { uploading } } = useFeeTitles();
    // 
    return (
        <>
            <>
                <form onSubmit={onSave}>
                    <Section title={"Fee title setup"}>
                        <FilterSection title={"Setup fee title"}>
                            <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                                <TextInput input={{ name: 'title', label: 'Title', placeholder: 'monthly fee' }} value={form?.title} onChange={onChange} />
                            </div>
                        </FilterSection>
                        <FilterSection title={"Payment month"}>
                            <MonthPicker data={form?.months} onSelect={onChange}
                                allMonths={{ pickedAllMonths, setPickedAllMonths }} onSelectAll={onSelectAll} />
                        </FilterSection>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" className="mx-1" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={uploading} disabled={uploading} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                {titles ? <BasicTable name={"Fee titles"} columns={[
                    ['title'],
                    ['detailed_months', 'months']
                ]} data={titles} onSelect={(action, id) => {
                    if (action === editAction.action) onEdit(id);
                    // else if (action === deleteAction.action) onDelete(id);
                }} actions={[
                    editAction,
                    // deleteAction
                ]} /> :
                    <Loader />
                }
            </>
        </>
    )
}

export default function () {
    return (
        <FeeTitlesProvider>
            <FeeTitleSetup />
        </FeeTitlesProvider>
    )
}