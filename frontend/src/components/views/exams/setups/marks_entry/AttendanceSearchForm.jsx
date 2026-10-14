import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import FormSaveButton from "@/components/buttons/FormSaveButton";
import Accordion from "@/components/Accordion";

function MarksEntryAttendanceSearchForm({ data, onChange, onSearch, isSearching = false }) {
    return (
        <>
            <Accordion title={"Autofill Attendance"}
                description={"Get attendance from app and auto-fill in the form below."}>
                <form className="px-2" onSubmit={onSearch}>
                    <Section>
                        <TextInput input={{ name: 'start_date', label: "Date (From)" }} value={data?.start_date} onChange={onChange} />
                        <TextInput input={{ name: 'end_date', label: "Date (To)" }} value={data?.end_date} onChange={onChange} />
                    </Section>
                    <ButtonsSecion>
                        <FormSaveButton isSearch={true} searching={isSearching} />
                    </ButtonsSecion>
                </form>
            </Accordion>
        </>
    )
}

export default MarksEntryAttendanceSearchForm;