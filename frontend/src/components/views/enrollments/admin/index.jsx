import { useAppContext } from "@/contexts/AppContext";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import { useEffect, useState } from "react";
import EnrollmentContextProvider from "@/contexts/EnrollmentContext";
import adminSchema from "@/schemas/admin";
import adminValidationSchema from "@/schemas/validations/admin";
import Head from "next/head";
import { getSchoolAdmins, saveSchoolAdmin } from "@/services/functions/schools";
import AdminEnrollment from "./AdminEnrollment";
import useRequestStatus from "@/hooks/requestStatus";
import usePasswordChange from "@/hooks/passwordChange";
import changePassword from "@/services/functions/auth/change_password";
import { object } from "yup";
import { getEconomicYears } from "@/services/functions/fiscalYear";

const _adminSchema = flattenSchema(adminSchema);
function AdminManagementView() {
    const { notification: { updateNotification } } = useAppContext();
    // 
    const [economicYears, setEconomicYears] = useState([]);
    const [admin, setAdmin] = useState(() => ({ ..._adminSchema })); // admin-form;
    const [errors, setErrors] = useState({});
    const [admins, setAdmins] = useState(null); // all admins;
    const [passwordModalAdmin, setPasswordModalAdmin] = useState(null);
    // The add/edit form and a row's full record both open as modals over the
    // list, so the list is the page.
    const [formOpen, setFormOpen] = useState(false);
    const [viewedAdmin, setViewedAdmin] = useState(null);
    // Why the last save was refused. Shown INSIDE the form's modal: a toast is
    // drawn under a dialog's backdrop, where it cannot be read.
    const [formError, setFormError] = useState('');
    const { fetching, uploading, statusHandler } = useRequestStatus();
    const { newPassword, errors: passwordErrors, onChange: onPasswordChange, onBlur: onPasswordBlur,
        hasTypedSamePasswords, resetPasswordChangeForm } = usePasswordChange();
    // 
    function onSchoolSelect(action, index, item) {
        setAdmin(item);
        resetPasswordChangeForm();
    }
    function openForm(item = null) {
        if (item) onSchoolSelect('edit', item?.id, item);
        else resetForm();
        setErrors({});
        setFormError('');
        setViewedAdmin(null);
        setFormOpen(true);
    }
    // The fields are left as they are: the modal still shows them while it
    // fades out, and `openForm` always sets them afresh.
    function closeForm() {
        setFormOpen(false);
        setErrors({});
        setFormError('');
    }
    function onActionSelect(action, index, item) {
        if (action === 'change_password') {
            setViewedAdmin(null);
            setPasswordModalAdmin(item);
            resetPasswordChangeForm();
        } else if (action === 'edit') {
            openForm(item);
        } else if (action === 'view') {
            setViewedAdmin(item);
        }
    }
    function onChange({ name, value }) {
        setAdmin(state => ({ ...state, [name]: value }));
    }
    async function onBlur({ name, value }) {
        try {
            await adminValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }
    // 
    async function onSubmit(e) {
        e.preventDefault();
        setFormError('');
        statusHandler.toggleUploading();
        try {
            const validationSchema = admin?.id ? adminValidationSchema.shape({
                username: object().notRequired(),
                password: object().notRequired()
            }) : adminValidationSchema;
            await validationSchema.validate(admin);
            // 
            const [status, message, data] = await saveSchoolAdmin(
                fillData(adminSchema, admin));
            if (status !== 200) setFormError(message || 'The school could not be saved.');
            else updateNotification(status, message);
            if (status === 200) {
                if (admin?.id) {
                    // after update;
                    const { account__username, id, ...main_data } = admin;
                    // the list columns render the "_str" variants, so keep them
                    // in sync with the booleans we just saved.
                    main_data.time_set_required_str = main_data.time_set_required ? 'yes' : 'no';
                    main_data.uses_mobile_app_str = main_data.uses_mobile_app ? 'yes' : 'no';
                    main_data.uses_sms_str = main_data.uses_sms ? 'yes' : 'no';
                    main_data.test_account_str = main_data.test_account ? 'yes' : 'no';
                    setAdmins(state =>
                        [...state
                            .map(item =>
                                item.id === admin.id ? { ...item, ...main_data } : item)
                        ]);
                } else if (data?.school) {
                    // after new entry. The save answers with part of the row
                    // (no account id, so its Password button did nothing until
                    // a reload); the list has the whole of it.
                    const saved = (await getSchoolAdmins() || []).find?.(item => item.id === data.school.id);
                    setAdmins(state => ([saved || data.school, ...state]));
                }
                closeForm();
            }
        } catch ({ message, path }) {
            // a failed validation names its field, so the field says so too
            if (path) setErrors(errors => ({ ...errors, [path]: message }));
            setFormError(message);
        }
        statusHandler.toggleUploading();
    }

    async function handlePasswordChange(e) {
        e.preventDefault();
        // Only ever the school the dialog was opened for. This used to fall back
        // to `admin?.account__id` — whichever school the FORM last held — so a
        // row without an account id changed another school's password.
        const userId = passwordModalAdmin?.account__id;
        if (!userId) return;
        statusHandler.toggleUploading();
        const [status, message] = await changePassword("admin", userId, newPassword);
        updateNotification(status, message);
        if (status === 200) {
            resetPasswordChangeForm();
            setPasswordModalAdmin(null);
        }
        statusHandler.toggleUploading();
    }
    function resetForm() {
        setAdmin({ ..._adminSchema });
    }
    // "Reset" inside the form: an add form empties, an edit form goes back to
    // the school as it is saved (emptying it would turn an edit into an add).
    function resetFormFields() {
        const saved = admin?.id ? (admins || []).find(item => item.id === admin.id) : null;
        setAdmin(saved || { ..._adminSchema });
        setErrors({});
        setFormError('');
    }
    //
    useEffect(() => {
        // The second toggle used to run straight after the first, before either
        // request had answered — so "fetching" was never true and the list
        // opened on "Nothing here yet" until the schools arrived.
        statusHandler.toggleFetching(true);
        (async () => {
            try {
                const data = await getSchoolAdmins();
                const ecoYears = await getEconomicYears(true);
                setAdmins(data);
                setEconomicYears(ecoYears);
            } finally {
                statusHandler.toggleFetching(false);
            }
        })();
    }, []);
    return (
        <EnrollmentContextProvider value={{
            data: { admin, admins, economicYears, newPassword, passwordModalAdmin, formOpen, viewedAdmin, formError },
            errors: { ...errors, ...passwordErrors },
            status: { uploading, fetching },
            methods: { onChange, onBlur, onSubmit, resetForm, resetFormFields, onSchoolSelect, onActionSelect,
                onPasswordChange, onPasswordBlur, hasTypedSamePasswords, handlePasswordChange,
                setPasswordModalAdmin, openForm, closeForm, setViewedAdmin }
        }}>
            <Head>
                <title>Admin Management</title>
            </Head>
            <>
                <AdminEnrollment />
            </>
        </EnrollmentContextProvider>
    )
}

export default AdminManagementView;