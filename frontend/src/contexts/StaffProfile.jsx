import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAppContext } from "./AppContext";
import { getStaffDetails, saveStaff } from "@/services/functions/staffs";
import { fillData, flattenSchema } from "@/methods/FlattenSchema";
import extractDiff from "@/methods/extractDiff";
import staffSchema from "@/schemas/staff";
import cleanEmptyFields from "@/methods/cleanEmptyFields";
import staffValidationSchema from "@/schemas/validations/staff";
import usePasswordChange from "@/hooks/passwordChange";
import useRequestStatus from "@/hooks/requestStatus";
import changePassword from "@/services/functions/auth/change_password";
import { __save } from "@/services/functions";

const StaffProfileContext = createContext({});

export function useStaffProfile() {
    return useContext(StaffProfileContext);
}

export default function StaffProfileProvider({ children, staffId }) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const [staff, setStaff] = useState(null);
    const [staffBackup, setStaffBackup] = useState(null);
    const [errors, setErrors] = useState({});
    const [editMode, setEditMode] = useState(false);
    const [currentTab, setCurrentTab] = useState('');
    const [editingTab, setEditingTab] = useState('');
    const { newPassword, resetPasswordChangeForm, ...pwChangeMethods } = usePasswordChange();
    const { statusHandler, uploading } = useRequestStatus();
    // 
    function onChange({ name, value }) {
        if (name === "permission") {
            let permissions = new Set(staff.permissions);//passed array;
            if (permissions.has(value)) permissions.delete(value);
            else permissions.add(value);
            permissions = Array.from(permissions);
            setStaff(state => ({ ...state, permissions }));
        } else setStaff(state => ({ ...state, [name]: value }));
    }

    const onBlur = useCallback(async ({ name, value }) => {
        try {
            await staffValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }, []);

    function onReset(parent = null) {
        const _staff = { ...staff };
        Object.entries(parent ? staffBackup.data[parent] || {} : staffBackup.data || {})
            ?.map(([key, prevVal]) => {
                if (_staff?.[key] && _staff[key] != prevVal) {
                    // console.log(key);
                    // if value is changed, reset current/changed value to previous-value;
                    _staff[key] = prevVal;
                }
            });
        setStaff(_staff);
    }
    // A picture saved or removed on its own: the form and the backup the next
    // Update is diffed against both take it (see StudentProfile.onImageSaved).
    function onImageSaved(name, path) {
        setStaff(state => (state ? { ...state, [name]: path } : state));
        setStaffBackup(state => (state ? { ...state, data: { ...state.data, [name]: path } } : state));
    }
    async function onUpdate() {
        // SYNC with student-profile.jsx;
        statusHandler.toggleUploading();
        try {
            let data = extractDiff(flattenSchema(staffBackup.data), staff);
            const keys = Object.keys(data);
            data = fillData(staffSchema, data);
            data = cleanEmptyFields(data, keys);
            if (Object.keys(data).length > 0) {
                await staffValidationSchema.validate(staff);
                data["id"] = staffBackup.ids.sid;
            } else {
                updateNotification(400, "Nothing changed!");
                statusHandler.toggleUploading();
                return null;
            }
            data?.other_info && (data['other_info']['id'] = staffBackup.ids.oid);
            const [status, message, _] = await saveStaff({ ...data, school: user?.profile?.school || user?.profile?.id });
            if (status === 200) {
                const bkpData = fillData(staffBackup.data, staff);
                setStaffBackup(state => ({ ...state, data: bkpData }));
            }
            updateNotification(status, message);
            setEditingTab('');
            setEditMode(state => !state);
        } catch ({ message }) {
            updateNotification('', message);
        }
        statusHandler.toggleUploading();
    }
    async function createAccount(e) {
        e.preventDefault();
        if (pwChangeMethods.hasTypedSamePasswords()) {
            statusHandler.toggleUploading();
            const { username, password } = newPassword;
            const [status, msg,] = await __save("/auth/staff/register", { username, password, staff: staff.id });
            updateNotification(status, msg);
            if (status === 200) {
                resetPasswordChangeForm();
            }
            statusHandler.toggleUploading();
        }
    }
    async function handlePasswordChange(e) {
        e.preventDefault();
        statusHandler.toggleUploading();
        const ROLE = "staff";
        const [status, msg,] = await changePassword(ROLE, staff?.account_id, newPassword);
        updateNotification(status, msg);
        if (status === 200) {
            resetPasswordChangeForm();
        }
        statusHandler.toggleUploading();
    }
    function handleViewMode(section) {
        setEditingTab(section);
        setEditMode(state => !state);
    }
    function isReadOnly(section) {
        return !(editingTab === section);
    }
    async function fetchStaffDetails() {
        let data = await getStaffDetails(staffId, user?.profile?.school || user?.profile?.id, true);
        // console.log(data);
        const { id: sid } = data; // extracting ids for later use;
        const ids = { sid }; // sid
        if (data?.other_info?.id) {
            ids['oid'] = data.other_info.id; // other_info_id;
        }
        setStaffBackup({ ids, data }); // backing up data for resets and more.
        data = flattenSchema(data);
        data['id'] = sid;
        setStaff(data); // form data
    }
    // 
    useEffect(() => {
        (async () => {
            await fetchStaffDetails();
        })();
        (() => {
            setEditMode(false);
            setEditingTab('');
        })();
    }, [staffId]);
    // 
    return (
        <StaffProfileContext.Provider value={{
            data: { staffId, staff, staffBackup, errors },
            methods: { onChange, onBlur, onReset, onUpdate },
            images: { onImageSaved },
            view: { currentTab, setCurrentTab, editMode, editingTab, handleViewMode, isReadOnly },
            password: { newPassword, ...pwChangeMethods, handlePasswordChange, createAccount },
            status: { uploading }
        }}>
            {children}
        </StaffProfileContext.Provider>
    )
}