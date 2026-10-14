import Loader from "@/components/Loader";
import { TextInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import BasicTable from "@/components/tables/BasicTable";
import { useAppContext } from "@/contexts/AppContext";
import useRequestStatus from "@/hooks/requestStatus";
import { staffRoleSchema } from "@/schemas/staff";
import { staffRoleValidationSchema } from "@/schemas/validations/staff";
import { fetchStaffRoles, saveStaffRole } from "@/services/functions/staffs";
import { Button } from "@material-tailwind/react";
import { useEffect, useState } from "react";
// 
function ManageStaffRoles() {
    const { notification: { updateNotification } } = useAppContext();
    const [form, setForm] = useState(() => ({ ...staffRoleSchema }));
    const [errors, setErrors] = useState({});
    const [staffRoles, setStaffRoles] = useState([]);
    const { fetching, uploading, statusHandler } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        setForm(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await staffRoleValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    async function onSave(e) {
        e.preventDefault();
        try {
            statusHandler.toggleUploading();
            await staffRoleValidationSchema.validate(form);
            const [status, message, data] = await saveStaffRole(form);
            updateNotification(status, message);
            if (status === 200) {
                setForm({ ...staffRoleSchema });
                if (data?.role) {
                    setStaffRoles(state => ([data.role, ...state]));
                }
            }
            statusHandler.toggleUploading();
        } catch ({ message }) {
            updateNotification('', message);
            statusHandler.toggleUploading();
        }
    }
    useEffect(() => {
        (async () => {
            statusHandler.toggleFetching();
            const _staffRoles = await fetchStaffRoles();
            // console.log(_staffRoles);
            setStaffRoles(_staffRoles);
            statusHandler.toggleFetching();
        })();
    }, []);
    return (
        <>
            <form onSubmit={onSave}>
                <Section title={"Setup new staff role/positions"}>
                    <TextInput input={{ name: 'role', label: 'Role' }} value={form?.role} error={errors?.role} onChange={onChange} onBlur={onBlur} />
                </Section>
                <ButtonsSecion>
                    <Button variant="outlined" type="submit" disabled={uploading}>
                        {uploading ? "Saving..." : "Save"}
                    </Button>
                </ButtonsSecion>
            </form>
            {
                fetching ?
                    <Loader /> :
                    <>
                        {
                            staffRoles?.length > 0 ?
                                <BasicTable name={"Staff roles"} data={staffRoles} columns={[
                                    ['role']
                                ]}
                                    onSelect={() => null} />
                                :
                                <>No data found!</>
                        }
                    </>
            }
        </>
    )
}

export default ManageStaffRoles;