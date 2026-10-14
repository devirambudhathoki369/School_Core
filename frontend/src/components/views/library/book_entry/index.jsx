import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import { bookEntrySchema } from "@/schemas/library/book";
import { bookEntryValidationSchema } from "@/schemas/validations/library/bookValidations";
import { fetchLibraries } from "@/services/functions/library";
import { saveBook } from "@/services/functions/library/book";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

function BookEntryView() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    // 
    if (isUsingSharedLibrary(user)) {
        return <UsingSharedLibraryAlert />
    }
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
    bookEntrySchema['school'] = schoolId;
    bookEntrySchema['entry_date'] = user?.today;
    // 
    const [bookForm, setBookForm] = useState({ ...bookEntrySchema });
    const [errors, setErrors] = useState({});
    const [libraries, setLibraries] = useState([]);
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setBookForm(state => ({ ...state, [name]: value }));
    }

    async function onBlur({ name, value }) {
        try {
            await bookEntryValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }

    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await bookEntryValidationSchema.validate(bookForm, { abortEarly: true });
            const [status, msg, _] = await saveBook(bookForm);
            updateNotification(status, msg);
            if (status === 200) onReset();
        } catch (e) {
            updateNotification(400, e.message);
        }
        statusHandler.toggleUploading();
    }

    function onReset() {
        setBookForm({ ...bookEntrySchema });
    }

    useEffect(() => {
        (async () => {
            const _libs = await fetchLibraries(schoolId, '', true);
            if (_libs?.length) {
                bookEntrySchema['library'] = _libs?.[0]?.value || '';
                setBookForm({ ...bookEntrySchema });
                setLibraries(_libs);
            }
        })();
    }, []);

    return (
        <div>
            <form onSubmit={onSubmit}>
                <Section title={"Book Entry"}>
                    <SelectInput input={{ name: 'library', label: "Library", options: libraries }}
                        value={bookForm?.library} error={errors?.library} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'entry_date', label: "Entry Date" }}
                        value={bookForm?.entry_date} error={errors?.entry_date} onChange={onChange} onBlur={onBlur} />
                    <span className="hidden sm:block sm:col-span-4">
                        {/* class-info */}
                    </span>
                    {/*  */}
                    <TextInput input={{ name: 'title', label: "Title" }} value={bookForm?.title} error={errors?.title}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'edition', label: "Edition" }} value={bookForm?.edition} error={errors?.edition}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'place_and_publisher', label: "Place and Publisher" }} value={bookForm?.place_and_publisher} error={errors?.place_and_publisher}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'isbn_no', label: "ISBN No." }} value={bookForm?.isbn_no} error={errors?.isbn_no}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'source', label: "Source" }} value={bookForm?.source} error={errors?.source}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'pages', label: "Pages" }} value={bookForm?.pages} error={errors?.pages}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'quantity', label: "Quantity" }} value={bookForm?.quantity} error={errors?.quantity}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'published_year', label: "Published Year", placeholder: "YYYY" }} value={bookForm?.published_year} error={errors?.published_year}
                        onChange={onChange} onBlur={onBlur} />
                </Section>
                <Section>
                    <TextInput input={{ name: 'vendor', label: "Vendor" }} value={bookForm?.vendor} error={errors?.vendor}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'vendor_contact', label: "Vendor Contact" }} value={bookForm?.vendor_contact} error={errors?.vendor_contact}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'call_no', label: "Call No." }} value={bookForm?.call_no} error={errors?.call_no}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'personal_author', label: "Personal Author" }} value={bookForm?.personal_author} error={errors?.personal_author}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'corporate_author', label: "Corporate Author" }} value={bookForm?.corporate_author} error={errors?.corporate_author}
                        onChange={onChange} onBlur={onBlur} />
                </Section>
                <Section>
                    <TextInput input={{ name: 'broad_subject', label: "Broad Subject" }} value={bookForm?.broad_subject} error={errors?.broad_subject}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'geographical_descriptions', label: "Geographical Descriptions" }} value={bookForm?.geographical_descriptions} error={errors?.geographical_descriptions}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'keywords', label: "Keywords", placeholder: "Separate by comma" }} value={bookForm?.keywords} error={errors?.keywords}
                        onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'note', label: "Note" }} value={bookForm?.note} error={errors?.note}
                        onChange={onChange} onBlur={onBlur} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton saving={uploading} isUpdate={bookForm?.id} />
                </ButtonsSecion>
            </form>
        </div>
    )
}

export default BookEntryView;