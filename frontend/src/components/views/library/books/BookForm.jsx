import { useState } from "react";
import { Button } from "@material-tailwind/react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { SelectInput, TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import useRequestStatus from "@/hooks/requestStatus";
import { bookEntrySchema } from "@/schemas/library/book";
import { bookEntryValidationSchema } from "@/schemas/validations/library/bookValidations";
import { saveBook } from "@/services/functions/library/book";

/**
 * Reusable book add/edit form. Used standalone and inside the Books modal.
 *
 * props:
 *  - schoolId, today        : defaults for new books
 *  - libraries              : [{ name, value }] options
 *  - initialBook            : full book record when editing (else null)
 *  - onSaved(status, msg)   : called after a successful save
 *  - onCancel               : optional, shows a Cancel button (modal use)
 */
function BookForm({ schoolId, today, libraries = [], initialBook = null, onSaved = () => null, onCancel }) {
    const makeFresh = () => ({
        ...bookEntrySchema,
        school: schoolId,
        entry_date: today || '',
        library: libraries?.[0]?.value || '',
    });

    const [bookForm, setBookForm] = useState(initialBook ? { ...bookEntrySchema, ...initialBook } : makeFresh());
    const [errors, setErrors] = useState({});
    const { uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setBookForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await bookEntryValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...rest }) => rest);
        } catch ({ message }) {
            setErrors(errs => ({ ...errs, [name]: message }));
        }
    }
    function onReset() {
        setBookForm(makeFresh());
        setErrors({});
    }
    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await bookEntryValidationSchema.validate(bookForm, { abortEarly: true });
            const [status, msg] = await saveBook(bookForm);
            if (status === 200 && !bookForm?.id) onReset();
            onSaved(status, msg);
        } catch (err) {
            onSaved(400, err.message);
        }
        statusHandler.toggleUploading();
    }

    return (
        <form onSubmit={onSubmit}>
            <Section title={bookForm?.id ? "Edit Book" : "Book Entry"}>
                <SelectInput input={{ name: 'library', label: "Library", options: libraries }}
                    value={bookForm?.library} error={errors?.library} onChange={onChange} onBlur={onBlur} />
                <TextInput input={{ name: 'entry_date', label: "Entry Date" }}
                    value={bookForm?.entry_date} error={errors?.entry_date} onChange={onChange} onBlur={onBlur} />
                <span className="hidden sm:block sm:col-span-4"></span>
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
                <TextInput input={{ name: 'price', label: "Price", type: "number", placeholder: "Per-book price" }} value={bookForm?.price} error={errors?.price}
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
                {onCancel && <Button variant="text" type="button" onClick={onCancel}>Cancel</Button>}
                <Button variant="outlined" type="button" onClick={onReset}>Reset</Button>
                <FormSaveButton saving={uploading} isUpdate={bookForm?.id} />
            </ButtonsSecion>
        </form>
    );
}

export default BookForm;
