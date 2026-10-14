import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import ClosedAcademicYearSelectInput from "@/components/inputs/ClosedAcademicYearSelectInput";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { __search } from "@/services/functions";
import { Button } from "@material-tailwind/react";
import { useState } from "react";

const API_PATH = "/api/search/certificates";
const searchSchema = { school: '', academic_year: '', issue_date: '', student_name: '', guardian_name: '', birth_date: '' };
function CertificateSearchForm({ setData }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    searchSchema['school'] = user?.profile?.school || user?.profile?.id;
    const [searchForm, setSearchForm] = useState({ ...searchSchema });
    const [closedAcademicYear, setClosedAcademicYear] = useState(null);
    const { searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setSearchForm(state => ({ ...state, [name]: value }));
    }
    async function onSearch(e) {
        e.preventDefault();
        statusHandler.toggleSearching();
        const _searchData = {
            ...searchForm,
            school: user?.profile?.school || user?.profile?.id,
            // A certificate is looked up by name years after it was issued, so
            // the search covers EVERY year unless a closed one is picked. It
            // used to be pinned to the running year without saying so, which
            // hid last year's certificates from the very list they sit in.
            academic_year: closedAcademicYear || '',
        }
        const [status, msg, data] = await __search(API_PATH, _searchData);
        if (Array.isArray(data)) {
            // Nothing found is an ANSWER and has to read as one: falling back
            // to the full list in silence looks exactly like a search that
            // did not run.
            if (data.length < 1) updateNotification('', 'No certificate matches this search.');
            setData(data.length > 0 ? data : null);
        } else {
            updateNotification(status, msg || 'The search could not be completed. Please try again.');
            setData(null);
        }
        statusHandler.toggleSearching();
    }
    function onReset() {
        setSearchForm({ ...searchSchema });
        setClosedAcademicYear(null);
        setData(null);
    }

    return (
        <div className="m-1">
            <form onSubmit={onSearch}>
                <Section>
                    <ClosedAcademicYearSelectInput value={closedAcademicYear} onChange={setClosedAcademicYear} />
                    <TextInput input={{ name: "issue_date", label: "Date of Issue" }} onChange={onChange} value={searchForm?.issue_date} />
                    <span className="hidden sm:block sm:col-span-4"></span>
                    <TextInput input={{ name: "student_name", label: "Student Name" }} onChange={onChange} value={searchForm?.student_name} />
                    <TextInput input={{ name: "guardian_name", label: "Guardian Name" }} onChange={onChange} value={searchForm?.guardian_name} />
                    <TextInput input={{ name: "birth_date", label: "Date of Birth" }} onChange={onChange} value={searchForm?.birth_date} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset} >Reset</Button>
                    <FormSaveButton isSearch={true} searching={searching} />
                </ButtonsSecion>
            </form>
        </div>
    )
}

export default CertificateSearchForm;