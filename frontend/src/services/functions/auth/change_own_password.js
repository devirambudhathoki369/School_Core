import { __update } from "..";
import { confirmAction } from "@/components/ConfirmDialog";

const OWN_CP_API = "/auth/my_password";

// The signed-in superadmin's own password. The backend always changes the
// account behind the session — no user id is sent — and wants the current one.
export default async function changeOwnPassword(data) {
    const ok = await confirmAction({
        title: "Change your password?",
        body: "The new password takes effect immediately. Every session on this account, including this one, is signed out.",
        confirmText: "Change password",
        tone: "warning",
    });
    if (!ok) return [];
    return __update(OWN_CP_API, data, false);
}
