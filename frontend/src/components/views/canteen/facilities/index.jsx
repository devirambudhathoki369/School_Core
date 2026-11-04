import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";
import { PlusIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { deleteAction, editAction } from "@/components/tables/actions";
import { deleteFacility, getFacilities } from "@/services/functions/canteen";
import { rs, useCanteenScope } from "../common";
import FacilityFormDialog from "./FacilityFormDialog";

const ACTIONS = [editAction, deleteAction];

function ClassesCell({ item }) {
    return (
        <div className="min-w-0 px-2 flex flex-wrap gap-1">
            {(item?.classes || []).map((c) => (
                <span key={c.key} className="inline-block rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-800 whitespace-nowrap">
                    {c.label} · <span className="font-semibold tabular-nums">{rs(c.amount)}</span>
                </span>
            ))}
        </div>
    );
}

const COLUMNS = [
    ["id", "id"], ["name", "facility"], ["class_names", "classes and amount a month", null, false, null, ClassesCell],
    ["users", "students"], ["remarks", "remark"],
];

/**
 * FACILITY SETUP — what the school bills by the month, and what each class pays.
 *
 * Who actually uses it is ticked in User Setup; each month's bill goes out from
 * Monthly Posting. Everything here is the canteen's own billing.
 */
function CanteenFacilities() {
    const { school, updateNotification } = useCanteenScope();
    const [rows, setRows] = useState(null);
    const [dialog, setDialog] = useState({ open: false, facility: null });

    async function load() {
        if (school) setRows(await getFacilities(school));
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [school]);

    async function onAction(action, id, facility) {
        if (action === "edit") setDialog({ open: true, facility });
        else if (action === "delete") {
            if (!await confirmAction({
                title: `Remove ${facility.name}?`, confirmText: "Remove",
                body: "Only a facility with no students ticked can be removed. Months already posted stay on the canteen accounts.",
            })) return;
            const [status, message] = await deleteFacility(school, facility.id);
            updateNotification(status === 200 ? 200 : 400, message || "Failed.");
            if (status === 200) load();
        }
    }

    if (rows === null) return <Loader />;

    return (
        <>
            <BasicTable name="Facilities" columns={COLUMNS} data={rows} showSelected={false} dense rowView={false}
                wideColumns={["remarks"]} mobileColumns={["name", "class_names"]} actions={ACTIONS} onSelect={onAction}
                topActions={
                    <Button color="teal" className="py-2 px-4 flex items-center gap-1" onClick={() => setDialog({ open: true, facility: null })}>
                        <PlusIcon className="h-4 w-4" strokeWidth={2.2} aria-hidden="true" /> Add facility
                    </Button>
                } />
            <FacilityFormDialog open={dialog.open} facility={dialog.facility} school={school}
                onClose={() => setDialog((s) => ({ ...s, open: false }))}
                onSaved={(message) => {
                    setDialog((s) => ({ ...s, open: false }));
                    updateNotification(200, message);
                    load();
                }} />
        </>
    );
}

export default CanteenFacilities;
