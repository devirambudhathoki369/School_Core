import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { BuildingStorefrontIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { SearchInput } from "@/components/inputs";
import { ButtonsSecion, Section } from "@/components/sections";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { getExtraBillingAccess, setExtraBillingAccess } from "@/services/functions/extra_billing";

/**
 * WHICH SCHOOLS MAY BILL PEOPLE WHO ARE NOT STUDENTS.
 *
 * Some schools own property they rent out — a shutter, a canteen, a room to an
 * office — and want those bills, receipts and dues kept the same way student
 * fees are. That is this module, and it is granted per school here: the same
 * reasoning as Library Access and Hostel Access, and deliberately the same
 * shape.
 *
 * Switching a school OFF deletes nothing. Their parties, bills and receipts
 * stay exactly where they are and come back untouched when it is switched on
 * again. Student billing is never affected either way — the two run side by
 * side, and a school with this module keeps billing students exactly as before.
 */
function ExtraBillingAccess() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        const { schools } = await getExtraBillingAccess();
        setSchools(schools);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    const options = useMemo(
        () => schools.map((s) => ({ value: s.id, name: s.name })),
        [schools]
    );
    const current = schools.find((s) => String(s.id) === String(school)) || null;
    const enabled = schools.filter((s) => s.uses_extra_billing);

    async function onToggle(target, next) {
        const turningOff = !next;
        const ok = await confirmAction({
            tone: turningOff ? "warning" : "info",
            confirmText: turningOff ? "Switch off" : "Switch on",
            title: turningOff
                ? `Switch extra billing OFF for ${target.name}?`
                : `Switch extra billing ON for ${target.name}?`,
            body: turningOff
                ? "The school stops seeing the Extra Billing menu and every extra-billing page and API stops "
                  + `answering for them. Nothing is deleted — ${target.parties || 0} party record(s) and every bill `
                  + "and receipt stay exactly as they are and come back if it is switched on again. "
                  + "Student billing is not affected."
                : `${target.name} will see an Extra Billing menu on their next sign-in. They start with nothing set `
                  + "up: they add their charge heads (Rent, Water…), then the people or shops they bill, then raise "
                  + "months and collect. Student billing carries on exactly as before.",
        });
        if (!ok) return;
        setSaving(true);
        const [status, message] = await setExtraBillingAccess(target.id, next);
        setSaving(false);
        if (status === 200) {
            setSchools((prev) => prev.map((s) =>
                String(s.id) === String(target.id) ? { ...s, uses_extra_billing: next } : s));
            updateNotification(200, message || "Saved!");
            load();
        } else {
            updateNotification(400, message || "Failed.");
        }
    }

    if (loading) return <Loader />;

    return (
        <div className="flex flex-col gap-y-4">
            <Section
                title="Extra billing access"
                description={
                    "Which schools may bill people who are NOT students — the tenant of a shutter, a canteen "
                    + "contractor, an office renting a room: their charge heads, monthly bills, receipts, dues and "
                    + "records.\n"
                    + "A school without it never sees the Extra Billing menu, and every extra-billing endpoint "
                    + "refuses them. Switching a school off never deletes their records, and student billing runs "
                    + "untouched either way."
                }>
                <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-x-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                        <BuildingStorefrontIcon className="w-4 h-4" />
                        {enabled.length} of {schools.length} school(s) have it
                    </span>
                </div>
            </Section>

            <Section title="Switch a school on or off"
                description="Pick a school to see what they currently have.">
                <SearchInput input={{ name: "school", label: "School", options }}
                    value={school} onChange={({ value }) => setSchool(value)} />
            </Section>

            {current && (
                <>
                    <div className="rounded-lg border border-gray-200 bg-white p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                                <p className="font-semibold text-gray-900">{current.name}</p>
                                <p className="text-xs text-gray-500">{current.address}</p>
                            </div>
                            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                                current.uses_extra_billing
                                    ? "border-green-200 bg-green-50 text-green-800"
                                    : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                                {current.uses_extra_billing ? "Module ON" : "Module OFF"}
                            </span>
                        </div>
                        {current.uses_extra_billing && (
                            <p className="mt-3 text-sm text-gray-600">
                                {current.parties || 0} party(ies) · {current.receipts || 0} receipt(s) issued.
                            </p>
                        )}
                    </div>
                    <ButtonsSecion>
                        <Button color={current.uses_extra_billing ? "red" : "teal"} disabled={saving}
                            onClick={() => onToggle(current, !current.uses_extra_billing)}
                            className="rounded-lg normal-case font-semibold shadow-sm">
                            {saving ? "Saving…" : current.uses_extra_billing ? "Switch OFF" : "Switch ON"}
                        </Button>
                    </ButtonsSecion>
                </>
            )}

            <Section title="Schools with extra billing"
                description="Everyone who currently has it, and what they have on record.">
                <div className="sm:col-span-12">
                    {enabled.length < 1
                        ? <p className="text-sm text-gray-500">No school has extra billing yet.</p>
                        : <BasicTable name="Extra billing — enabled schools"
                            columns={[
                                ["name", "school"],
                                ["address", "address"],
                                ["parties", "parties"],
                                ["receipts", "receipts"],
                            ]}
                            data={enabled} />}
                </div>
            </Section>
        </div>
    );
}

export default ExtraBillingAccess;
