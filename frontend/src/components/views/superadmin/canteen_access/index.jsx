import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ShoppingBagIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { getCanteenAccess, setCanteenAccess } from "@/services/functions/canteen";

function rs(value) {
    return Number(value || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * WHICH SCHOOLS HAVE THE CANTEEN.
 *
 * The same reasoning and the same shape as Hostel Access and Extra Billing
 * Access: the module is sold per school, so it is switched on here and nowhere
 * else.
 *
 * Switching a school OFF deletes nothing — items, sales and card accounts come
 * back untouched when it is switched on again. What has to be said before
 * switching off is the money HELD on cards: families' top-ups not yet spent,
 * which the school cannot refund through the canteen while it is off.
 */
function CanteenAccess() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        const { schools } = await getCanteenAccess();
        setSchools(schools);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    const options = useMemo(() => schools.map((s) => ({ value: s.id, name: s.name })), [schools]);
    const current = schools.find((s) => String(s.id) === String(school)) || null;
    const enabled = schools.filter((s) => s.uses_canteen);

    async function onToggle(target, next) {
        if (saving) return;
        const turningOff = !next;
        const held = Number(target.held || 0);
        const ok = await confirmAction({
            tone: turningOff ? "warning" : "info",
            confirmText: turningOff ? "Switch off" : "Switch on",
            title: turningOff ? `Switch the canteen OFF for ${target.name}?` : `Switch the canteen ON for ${target.name}?`,
            body: turningOff
                ? "The school stops seeing the Canteen menu and every canteen page and API stops answering for them. "
                  + "Nothing is deleted — items, sales and card accounts come back if it is switched on again."
                  + (held > 0 ? ` Rs. ${rs(held)} of families' top-ups is still held on cards and cannot be refunded through the canteen while it is off.` : "")
                : `${target.name} will see a Canteen menu on their next sign-in. They start by adding their items and prices; `
                  + "cash and card accounts are both allowed, prepaid only, until they change it in Canteen Setup.",
        });
        if (!ok) return;
        setSaving(true);
        const [status, message] = await setCanteenAccess(target.id, next);
        setSaving(false);
        if (status === 200) { updateNotification(200, message || "Saved!"); load(); }
        else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <Section title="Canteen access"
                description={"Which schools have the canteen: the counter (card tap, roll number or name), items and prices, "
                    + "card accounts families top up, canteen owing carried onto the fee bill, and the canteen's records.\n"
                    + "A school without it never sees the Canteen menu, and every canteen endpoint refuses them. "
                    + "Switching a school off never deletes their records."}>
                <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-x-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                        <ShoppingBagIcon className="w-4 h-4" />
                        {enabled.length} of {schools.length} school(s) have it
                    </span>
                </div>
            </Section>

            <Section title="Switch a school on or off" description="Pick a school to see what they currently have.">
                <SearchInput input={{ name: "school", label: "School", options }} value={school}
                    onChange={({ value }) => setSchool(value)} />
            </Section>

            {current && (
                <>
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900">{current.name}</p>
                                <p className="text-xs text-gray-500">{current.address}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${current.uses_canteen
                                ? "border-green-200 bg-green-50 text-green-800" : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                                {current.uses_canteen ? "Module ON" : "Module OFF"}
                            </span>
                        </div>
                        {(current.uses_canteen || current.items > 0) && (
                            <p className="mt-3 text-sm text-gray-600">
                                {current.items || 0} item(s) · {current.sales_this_month || 0} sale(s) this month
                                (Rs. {rs(current.sales_amount_this_month)}) · Rs. {rs(current.held)} held on cards
                                {Number(current.owing) > 0 ? ` · Rs. ${rs(current.owing)} owed` : ""}.
                            </p>
                        )}
                    </div>
                    <ButtonsSecion>
                        <Button color={current.uses_canteen ? "red" : "teal"} disabled={saving}
                            onClick={() => onToggle(current, !current.uses_canteen)}
                            className="rounded-lg normal-case font-semibold shadow-sm">
                            {saving ? "Saving…" : current.uses_canteen ? "Switch OFF" : "Switch ON"}
                        </Button>
                    </ButtonsSecion>
                </>
            )}

            <Section title="Schools with the canteen" description="Everyone who currently has it, and what they have on record.">
                <div className="sm:col-span-12">
                    {enabled.length < 1
                        ? <p className="text-sm text-gray-500">No school has the canteen yet.</p>
                        : <BasicTable name="Canteen — enabled schools"
                            columns={[
                                ["name", "school"],
                                ["address", "address"],
                                ["items", "items"],
                                ["sales_this_month", "sales this month"],
                                ["sales_amount_this_month", "amount this month"],
                                ["held", "held on cards"],
                                ["owing", "owed"],
                            ]}
                            data={enabled.map((s) => ({
                                ...s, sales_amount_this_month: Number(s.sales_amount_this_month || 0),
                                held: Number(s.held || 0), owing: Number(s.owing || 0),
                            }))} />}
                </div>
            </Section>
        </div>
    );
}

export default CanteenAccess;
