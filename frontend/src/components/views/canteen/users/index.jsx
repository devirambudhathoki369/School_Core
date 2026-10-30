import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { customAction, editAction, passwordAction } from "@/components/tables/actions";
import { CANTEEN_PAGES } from "@/configs/canteen";
import Users from "@/configs/Users";
import { getCanteenUsers, saveCanteenUser } from "@/services/functions/canteen";
import { Note, SetupNeeded, StatusPill, useCanteenScope } from "../common";
import PasswordDialog from "./PasswordDialog";
import UserFormDialog from "./UserFormDialog";

const switchAction = customAction({ text: "Switch off / on", action: "switch", tooltip: "Stop or allow this sign-in" });
const USER_ACTIONS = [editAction, passwordAction, switchAction];

function PersonCell({ item }) {
    return (
        <div className="min-w-0 px-2">
            <span className="app-cell-text block break-words text-blue-gray-900 !font-semibold">{item?.full_name}</span>
            <span className="block text-meta text-[var(--ink-500,#64748b)]">
                {[item?.username, item?.contact].filter(Boolean).join(" · ")}
            </span>
        </div>
    );
}
function PagesCell({ item }) {
    return (
        <span className="flex flex-wrap gap-1 px-2 py-1">
            {(item?.page_names || []).map((name) => <StatusPill key={name} text={name} tone="blue" />)}
        </span>
    );
}
function StatusCell({ item }) {
    return <span className="block px-2">{item?.is_active ? <StatusPill text="Can sign in" tone="green" /> : <StatusPill text="Switched off" tone="gray" />}</span>;
}

// When they last signed in, by this computer's clock.
function when(value) {
    if (!value) return "Never";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    const pad = (n) => `${n}`.padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const USER_COLUMNS = [
    ["full_name", "canteen user", null, false, null, PersonCell],
    ["page_names", "pages", null, false, null, PagesCell],
    ["is_active", "status", null, false, null, StatusCell],
    ["last_signed_in", "last sign-in"],
    ["created_by", "added by"],
];

/**
 * CANTEEN USERS — people who sign in to the canteen and see nothing else.
 *
 * A counter hand, the canteen's manager, a contractor's cashier: they get a
 * username and password of their own, sign in at /canteen, and open only the
 * canteen pages ticked for them. They are not staff — no staff list, payroll
 * or app — and their sign-in opens nothing else in the school's system; the
 * server refuses it everywhere outside the canteen.
 *
 * Nobody is deleted: a user who leaves is switched off, and their slips and
 * receipts keep their name.
 */
function CanteenUsers() {
    const { user, school, updateNotification } = useCanteenScope();
    const [users, setUsers] = useState(null);
    const [dialog, setDialog] = useState({ open: false, user: null });
    const [passwordFor, setPasswordFor] = useState(null);

    async function load() {
        if (!school) return;
        setUsers(await getCanteenUsers(school));
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    // The school's office gives any page; anyone else only the pages they hold
    // themselves (the server holds them to the same).
    const grantable = useMemo(() => {
        const all = CANTEEN_PAGES.map((p) => p.value);
        if (user?.role === Users.ADMIN) return all;
        const held = new Set((user?.profile?.permissions || []).map(Number));
        return all.filter((p) => held.has(p));
    }, [user]);

    const rows = useMemo(() => (users || []).map((u) => ({ ...u, last_signed_in: when(u.last_login) })), [users]);
    const signInAddress = typeof window !== "undefined" ? `${window.location.origin}/canteen` : "/canteen";

    async function onAction(action, id, item) {
        if (action === "edit") setDialog({ open: true, user: item });
        else if (action === "change_password") setPasswordFor(item);
        else if (action === "switch") {
            const turningOff = item.is_active;
            if (!await confirmAction({
                title: turningOff ? `Switch off ${item.full_name}'s sign-in?` : `Let ${item.full_name} sign in again?`,
                body: turningOff
                    ? "They are signed out at once and cannot sign in until switched on again. Their sales and receipts keep their name."
                    : "They can sign in again with their username and password, and open the pages ticked for them.",
                tone: turningOff ? "warning" : "info",
                confirmText: turningOff ? "Switch off" : "Switch on",
            })) return;
            const [status, message] = await saveCanteenUser({ school, id: item.id, is_active: !turningOff });
            updateNotification(status === 200 ? 200 : 400, status === 200
                ? (turningOff ? `${item.full_name} is switched off.` : `${item.full_name} can sign in again.`)
                : message || "Failed.");
            if (status === 200) load();
        }
    }

    if (users === null) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <Note>
                Canteen users sign in at <span className="font-semibold break-all">{signInAddress}</span> with
                their own username and password, and see only the canteen pages ticked for them — nothing else of
                the school. Make one for each person at the counter, so every slip and receipt names who took the money.
            </Note>
            {rows.length < 1
                ? <SetupNeeded what="canteen users" where="Add one with Add canteen user. The school's own login opens the canteen as well." />
                : null}
            <BasicTable name="Canteen users" columns={USER_COLUMNS} detailColumns={["last_signed_in", "created_by"]}
                rowView={false} mobileColumns={["full_name"]} data={rows} showSelected={false} dense
                actions={USER_ACTIONS} onSelect={onAction}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setDialog({ open: true, user: null })}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add canteen user
                    </Button>
                } />

            <UserFormDialog open={dialog.open} user={dialog.user} school={school} grantable={grantable}
                onClose={() => setDialog((s) => ({ ...s, open: false }))}
                onSaved={(message) => {
                    setDialog((s) => ({ ...s, open: false }));
                    updateNotification(200, message || "Saved!");
                    load();
                }} />
            <PasswordDialog user={passwordFor} school={school} onClose={() => setPasswordFor(null)}
                onSaved={(message) => { setPasswordFor(null); updateNotification(200, message); load(); }} />
        </div>
    );
}

export default CanteenUsers;
