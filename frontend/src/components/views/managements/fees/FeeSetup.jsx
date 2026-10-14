import Loader from "@/components/Loader";
import { SearchInput, TextInput } from "@/components/inputs";
import ClassPicker from "@/components/inputs/ClassPicker";
import { ButtonsSecion, FilterSection, Section } from "@/components/sections";
import FeesProvider, { useFees } from "@/contexts/fees/FeesContext";
import { Button } from "@material-tailwind/react";
import FeeRow from "./FeeRow";
import FormSaveButton from "@/components/buttons/FormSaveButton";

function FeeSetup() {
    const { data: { titles, fees, form },
        methods: { onSave, onChange, onBlur, resetForm, onDelete }, status } = useFees();
    // 
    return (
        <>
            <>
                <form onSubmit={onSave}>
                    <Section title={"Fee setup"}>
                        <ClassPicker data={form} onChange={onChange} onBlur={onBlur} classwise={true} />
                        {/* fee type selection */}
                        <FilterSection title={"Setup"}>
                            <div className="grid grid-cols-1 sm:grid-cols-12 w-full gap-x-1">
                                <SearchInput input={{ name: 'title', label: 'Title', placeholder: 'Choose fee title', options: titles }}
                                    value={form?.title} onChange={onChange} onBlur={onBlur} />
                                <TextInput input={{ name: 'fee', label: 'Fee', type: 'number', placeholder: 'amount' }} value={form?.fee} onChange={onChange} />
                            </div>
                        </FilterSection>
                    </Section>
                    <ButtonsSecion>
                        <Button variant="outlined" className="mx-1" onClick={resetForm}>Reset</Button>
                        <FormSaveButton isUpdate={form?.id} saving={status.uploading} />
                    </ButtonsSecion>
                </form>
            </>
            <>
                <Section grid={false} title={"Fees"}>
                    {fees?.classes ?
                        <div className="children-text-base">
                            <FeeRow cid={null} cls={["Class", , "Fees count"]} />
                            {fees.classes
                                .map((cls, index) => (
                                    <FeeRow frIndex={index} key={index} cid={cls?.[1]?.id || ''} cls={cls} />
                                ))
                            }
                        </div> :
                        <Loader />
                    }
                </Section>
            </>
        </>
    )
}

export default function () {
    return (
        <FeesProvider>
            <FeeSetup />
        </FeesProvider>
    )
}