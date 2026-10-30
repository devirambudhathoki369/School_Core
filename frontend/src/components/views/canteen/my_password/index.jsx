import { useState } from "react";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import { PasswordInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import { changeMyCanteenPassword } from "@/services/functions/canteen";
import { passwordProblem } from "../users/UserFormDialog";
import { useCanteenScope, useOnce } from "../common";

const EMPTY = { current_password: "", password: "", confirm: "" };

/**
 * A canteen user's own password. The current one is asked again, so a counter
 * left signed in cannot be used to lock its owner out. This device stays
 * signed in; every other one signs in again.
 */
function CanteenMyPassword() {
    const { school, updateNotification } = useCanteenScope();
    const [form, setForm] = useState(EMPTY);
    const [errors, setErrors] = useState({});
    const [busy, once] = useOnce();

    function onChange({ name, value }) {
        setForm((state) => ({ ...state, [name]: value }));
        setErrors(({ [name]: _, ...rest }) => rest);
    }

    async function onSubmit(e) {
        e.preventDefault();
        const problems = {};
        if (!form.current_password) problems.current_password = "Enter your current password.";
        const weak = passwordProblem(form.password);
        if (weak) problems.password = weak;
        else if (form.password !== form.confirm) problems.confirm = "The two passwords are not the same.";
        setErrors(problems);
        if (Object.keys(problems).length) return updateNotification("", Object.values(problems)[0]);
        await once(async () => {
            const [status, message] = await changeMyCanteenPassword({
                school, current_password: form.current_password, password: form.password,
            });
            updateNotification(status === 200 ? 200 : 400, message || (status === 200 ? "Password changed." : "Failed."));
            if (status === 200) setForm(EMPTY);
        });
    }

    return (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-y-2">
            <Section title="Change my password"
                description={"6 to 20 characters, with upper and lower case letters, a number and one of @ $ ! % * # ? &.\n"
                    + "Your other devices will need to sign in again."}>
                <PasswordInput input={{ name: "current_password", label: "Current password", required: true, autoComplete: "current-password" }}
                    value={form.current_password} onChange={onChange} error={errors.current_password} />
                <PasswordInput input={{ name: "password", label: "New password", required: true, autoComplete: "new-password" }}
                    value={form.password} onChange={onChange} error={errors.password} />
                <PasswordInput input={{ name: "confirm", label: "New password again", required: true, autoComplete: "new-password" }}
                    value={form.confirm} onChange={onChange} error={errors.confirm} />
            </Section>
            <ButtonsSecion>
                <FormSaveButton custom={[busy, "Change password", "Saving…"]} />
            </ButtonsSecion>
        </form>
    );
}

export default CanteenMyPassword;
