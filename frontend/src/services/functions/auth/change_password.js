import { __update } from "..";
import { confirmAction } from "@/components/ConfirmDialog";

const CP_API = "/auth/change_password";

export default async function changePassword(role, user_account_id, data) {
    // The last `window.confirm` left in the product, on an action that signs
    // every one of the account's other devices out. It asked "Do you want to
    // change the password?" and named neither the account nor that consequence.
    const ok = await confirmAction({
        title: "Change this account's password?",
        body: "The new password takes effect immediately. Anyone signed in on another device with the old password will have to sign in again.",
        confirmText: "Change password",
        tone: "warning",
    });
    if (!ok) return [];
    return __update(CP_API, { role, user: user_account_id, ...data });
}
