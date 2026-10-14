import EnrollmentContextProvider, { useEnrollmentContext } from "@/contexts/EnrollmentContext";
import { ButtonsSecion, Section } from "@/components/sections";
import { PasswordInput, TextInput } from "@/components/inputs";
import { Button } from "@material-tailwind/react";
import { deleteAction, editAction } from "@/components/tables/actions";
import { useEffect, useState } from "react";
import superadminSchema from "@/schemas/superadmin";
import { __fetch, __save } from "@/services/functions";
import { useAppContext } from "@/contexts/AppContext";
import BasicTable from "@/components/tables/BasicTable";
import superadminValidationSchema from "@/schemas/validations/superadmin";

function SuperAdminEnrollment() {
    const { data: { superadmin, superadmins }, errors,
        methods: { onSubmit, onChange, onBlur, onReset } } = useEnrollmentContext();
    return (
        <>
            <>
                <form onSubmit={onSubmit}>
                    <div className="space-y-12">
                        <Section title={"SuperAdmin Registration"}
                            description={"Superadmin manages admin accounts and does more as sub high-account."}>
                            <>
                                <TextInput error={errors?.full_name} value={superadmin?.full_name} input={{ name: 'full_name', label: 'Full Name' }} onChange={onChange} onBlur={onBlur} />
                                <TextInput error={errors?.username} value={superadmin?.username} input={{ name: 'username', label: 'Username' }} onChange={onChange} onBlur={onBlur} />
                                <PasswordInput error={errors?.password} value={superadmin?.password} input={{ name: 'password', label: 'Password' }} onChange={onChange} onBlur={onBlur} />
                            </>
                        </Section>
                    </div>
                    <ButtonsSecion>
                        <Button variant="outlined" onClick={onReset}>Reset</Button>
                        <Button variant="outlined" type="submit">Submit</Button>
                    </ButtonsSecion>
                </form>
            </>
            <>
                <div className="my-3">
                    <BasicTable name={"Superadmin"} columns={[
                        ['full_name'],
                        ['username'],
                    ]} data={superadmins} actions={[
                        editAction, deleteAction
                    ]} />
                </div>
            </>
        </>
    );
}

function SuperAdminManagementView() {
    const { notification: { updateNotification } } = useAppContext();
    const [superadmin, setSuperadmin] = useState(() => ({ ...superadminSchema }));
    const [errors, setErrors] = useState({});
    const [superadmins, setSuperadmins] = useState([]);
    // 
    function onChange({ name, value }) {
        setSuperadmin(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await superadminValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    function onReset() {
        setSuperadmin({ ...superadminSchema });
    }
    // 
    async function onSubmit(e) {
        e.preventDefault();
        try {
            await superadminValidationSchema.validate(superadmin);
            const [status, message, data] = await __save('/auth/superadmin/register', superadmin);
            if (status === 200) {
                // 
                if (data?.data) {
                    setSuperadmins(state => [data.data, ...state]);
                }
                onReset();
            }
            updateNotification(status, message);
        } catch ({ message }) {
            updateNotification('', message);
        }
    }
    // 
    useEffect(() => {
        (async () => {
            const data = await __fetch('/auth/superadmins');
            setSuperadmins(data);
        })();
    }, []);
    return (
        <>
            <EnrollmentContextProvider value={{
                data: { superadmin, superadmins }, errors,
                methods: { onChange, onBlur, onSubmit, onReset }
            }}>
                <SuperAdminEnrollment />
            </EnrollmentContextProvider>
        </>
    )
}

export default SuperAdminManagementView;