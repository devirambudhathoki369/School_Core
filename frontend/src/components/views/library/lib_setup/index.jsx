import FormSaveButton from "@/components/buttons/FormSaveButton";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { editAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import { UsingSharedLibraryAlert, isUsingSharedLibrary } from "@/methods/library/isUsingSharedLibrary";
import librarySchema from "@/schemas/library";
import libraryValidationSchema from "@/schemas/validations/library/library";
import { fetchLibraries, saveLibrary } from "@/services/functions/library";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";

function LibrarySetup() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    // 
    if (isUsingSharedLibrary(user)) {
        return <UsingSharedLibraryAlert />
    }
    // 
    const schoolId = user?.profile?.school || user?.profile?.id;
    librarySchema['school'] = schoolId;
    const _libSchema = flattenSchema({ ...librarySchema });
    //  
    const [libraryForm, setLibraryForm] = useState({ ..._libSchema });
    const [errors, setErrors] = useState({});
    const [libraries, setLibraries] = useState([]);
    const { uploading, searching, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setLibraryForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await libraryValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }

    function onReset() {
        setLibraryForm({ ..._libSchema });
        setErrors({});
    }

    async function onSubmit(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        try {
            await libraryValidationSchema.validate(libraryForm, { abortEarly: true });
            // 
            const uploadData = fillData(librarySchema, libraryForm);
            const [status, msg,] = await saveLibrary(uploadData);
            updateNotification(status, msg);
            if (status === 200) {
                if (libraryForm?.id) {
                    setLibraries(state =>
                        [...state
                            .map(item =>
                                item.id === libraryForm.id ? { ...item, ...libraryForm } : item)
                        ]);
                } else {
                    // after new entry;
                    setLibraries(state => [{ ...libraryForm }, ...state]);
                }
                setLibraryForm({ ..._libSchema });
            }
        } catch (e) {
            updateNotification(400, e.message);
        }
        statusHandler.toggleUploading();
    }

    useEffect(() => {
        (async () => {
            statusHandler.toggleSearching();
            let _libs = await fetchLibraries(schoolId, '', '', true);
            if (_libs?.length) {
                _libs = _libs.map(e => ({
                    ...e,
                    ...(e.preferences || {}),
                }));
                setLibraries(_libs);
            }
            statusHandler.toggleSearching();
        })();
    }, []);

    return (
        <>
            <form onSubmit={onSubmit}>
                <Section title={"Library Setup"}>
                    <TextInput input={{ name: 'name', label: "Name", placeholder: "Main Library" }} value={libraryForm?.name}
                        error={errors?.name} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'address', label: "Address" }} value={libraryForm?.address}
                        error={errors?.address} onChange={onChange} onBlur={onBlur} />
                    <TextInput input={{ name: 'contacts', label: "Contacts", placeholder: "Separate by comma" }} value={libraryForm?.contacts}
                        error={errors?.contacts} onChange={onChange} onBlur={onBlur} />
                </Section>
                <Section title={"Library Settings"} description={"Damage/lost charges are now based on each book's price and set at return time."}>
                    <TextInput input={{ name: 'fine_per_day', label: "Fine per day" }}
                        error={errors?.fine_per_day} value={libraryForm?.fine_per_day} onChange={onChange} onBlur={onBlur} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={onReset}>Reset</Button>
                    <FormSaveButton saving={uploading} isUpdate={libraryForm?.id} />
                </ButtonsSecion>
            </form>
            {/*  */}
            <BasicTable data={libraries} columns={COLS}
                actions={[editAction]} onSelect={(action, _, item) => {
                    if (action === editAction.action) {
                        setLibraryForm(state => ({ ..._libSchema, ...item }));
                    }
                }} loading={searching} />
        </>
    )
}

const COLS = [
    ['name'],
    ['address'],
    ['contacts'],
    ['fine_per_day', "Fine per day"],
];

export default LibrarySetup;