import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { fetchLibraries } from "@/services/functions/library";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

const bookSearchSchema = { school: '', library: '', accession_no: '', title: '' };
function BookSearchForm({ user, onSearch }) {
    const schoolId = user?.profile?.school || user?.profile?.id;
    bookSearchSchema['school'] = schoolId;
    const [bookSearch, setBookSearch] = useState({ ...bookSearchSchema });
    const [errors, setErrors] = useState({});
    const [libraries, setLibraries] = useState([]);

    function onChange({ name, value }) {
        setBookSearch(state => ({ ...state, [name]: value }));
    }

    useEffect(() => {
        (async () => {
            const _libs = await fetchLibraries(schoolId, '', true);
            if (_libs?.length) {
                bookSearchSchema['library'] = _libs?.[0]?.value || '';
                setBookSearch({ ...bookSearchSchema });
                setLibraries(_libs);
            }
        })();
    }, []);

    function onReset() {
        setBookSearch({ ...bookSearchSchema });
    }

    function allowSearch() {
        return (bookSearch?.library && (bookSearch?.accession_no || bookSearch?.title));
    }

    return (
        <form onSubmit={(e) => {
            onSearch(e, bookSearch);
        }}>
            <Section title={"Search Book"}>
                <SelectInput input={{ name: 'library', label: "Library", options: libraries }}
                    value={bookSearch?.library} error={errors?.library} onChange={onChange} /* onBlur={onBlur} */ />
                <TextInput input={{ name: 'accession_no', label: "Accession No.", type: "number" }}
                    value={bookSearch?.accession_no} error={errors?.accession_no} onChange={onChange} /* onBlur={onBlur} */ />
                <TextInput input={{ name: 'title', label: "Book Title" }}
                    value={bookSearch?.title} error={errors?.title} onChange={onChange} /* onBlur={onBlur} */ />
            </Section>
            <ButtonsSecion>
                <Button variant="outlined" onClick={onReset}>Reset</Button>
                <FormSaveButton isSearch={true} disabled={!allowSearch()} />
            </ButtonsSecion>
        </form>
    )
}

export default BookSearchForm;