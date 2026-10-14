import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import Loader from "@/components/Loader";
import { TextInput, SearchInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction } from "@/components/tables/actions";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { fetchSchools } from "@/services/functions/schools";
import {
    fetchShareholders,
    saveShareholder,
    deleteShareholder,
} from "@/services/functions/superadmin/shareholders";

const EMPTY = { school: "", name: "", contact: "" };

// Shareholders receive each school's daily "Today's Collection Point" SMS
// (sent at 18:00). Superadmin adds/removes the recipient numbers here.
function ManageShareholders() {
    const { notification: { updateNotification } } = useAppContext();
    const [form, setForm] = useState(() => ({ ...EMPTY }));
    const [schools, setSchools] = useState([]);
    const [shareholders, setShareholders] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
    }

    async function loadShareholders() {
        statusHandler.toggleFetching();
        const data = await fetchShareholders();
        setShareholders(Array.isArray(data) ? data : []);
        statusHandler.toggleFetching();
    }

    async function onSave(e) {
        e.preventDefault();
        if (!form.school || !form.contact?.trim()) {
            updateNotification("", "School and contact are required.");
            return;
        }
        statusHandler.toggleUploading();
        const [status, message] = await saveShareholder(form);
        updateNotification(status, message);
        if (status === 200) {
            setForm({ ...EMPTY, school: form.school });
            await loadShareholders();
        }
        statusHandler.toggleUploading();
    }

    async function onSelect(action, id) {
        if (action !== "delete") return;
        const [status, message] = await deleteShareholder(id);
        if (status) updateNotification(status, message);
        if (status === 200) await loadShareholders();
    }

    useEffect(() => {
        (async () => {
            const options = await fetchSchools({}, "options");
            setSchools(Array.isArray(options) ? options : []);
            await loadShareholders();
        })();
    }, []);

    return (
        <>
            <form onSubmit={onSave}>
                <Section
                    title={"Daily collection SMS — shareholders"}
                    description={
                        "Recipients of each school's daily 'Today's Collection Point' SMS (sent at 6:00 PM)."
                    }
                    grid={2}
                >
                    <SearchInput
                        input={{ name: "school", label: "School", options: schools }}
                        value={form?.school}
                        onChange={onChange}
                        grid={2}
                    />
                    <TextInput
                        input={{ name: "contact", label: "Contact number" }}
                        value={form?.contact}
                        onChange={onChange}
                    />
                    <TextInput
                        input={{ name: "name", label: "Name (optional)" }}
                        value={form?.name}
                        onChange={onChange}
                    />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" onClick={() => setForm({ ...EMPTY })}>
                        Reset
                    </Button>
                    <Button variant="outlined" type="submit" disabled={uploading}>
                        {uploading ? "Saving..." : "Add shareholder"}
                    </Button>
                </ButtonsSecion>
            </form>
            {fetching ? (
                <Loader />
            ) : shareholders?.length > 0 ? (
                <BasicTable
                    name={"Shareholders"}
                    data={shareholders}
                    columns={[
                        ["school_name", "school"],
                        ["name"],
                        ["contact"],
                    ]}
                    actions={[deleteAction]}
                    onSelect={onSelect}
                />
            ) : (
                <>No shareholders added yet!</>
            )}
        </>
    );
}

export default ManageShareholders;
