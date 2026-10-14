import { object } from "yup";
import { strong_password } from "@/schemas/validations";
import { useState } from "react";

const pwChangeSchema = { username: '', password: '', confirm_password: '' };
const pwChangeValidationSchema = object({
    password: strong_password(),
    confirm_password: strong_password()
});

const usePasswordChange = () => {
    const [newPassword, setNewPassword] = useState({ ...pwChangeSchema });
    const [errors, setErrors] = useState({});

    function onChange({ name, value }) {
        setNewPassword(state => ({ ...state, [name]: value }));
    }

    async function onBlur({ name, value }) {
        try {
            await pwChangeValidationSchema.validateAt(name, { [name]: value });
            setErrors(({ [name]: _, ...errors }) => (errors));
        } catch ({ message }) {
            setErrors(errors => ({ ...errors, [name]: message }));
        }
    }

    function hasTypedSamePasswords() {
        if (!newPassword?.password || !newPassword?.confirm_password) return false;
        return newPassword?.password === newPassword?.confirm_password;
    }

    function resetPasswordChangeForm() {
        setNewPassword({ ...pwChangeSchema });
    }

    return {
        newPassword, errors, onChange, onBlur, hasTypedSamePasswords, resetPasswordChangeForm
    }
}

export default usePasswordChange;