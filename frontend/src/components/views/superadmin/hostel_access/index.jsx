import { useEffect, useMemo, useState } from "react";
import { Button } from "@material-tailwind/react";
import { HomeModernIcon } from "@heroicons/react/24/outline";

import { confirmAction } from "@/components/ConfirmDialog";
import { useAppContext } from "@/contexts/AppContext";
import { SearchInput } from "@/components/inputs";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import BasicTable from "@/components/tables/BasicTable";
import { getHostelAccess, setHostelAccess } from "@/services/functions/hostel";

/**
 * WHICH SCHOOLS HAVE THE HOSTEL MODULE.
 *
 * The hostel is sold per school. A school that could switch it on for itself
 * has not been sold anything, so the switch lives here — the same reasoning as
 * Library Access, and deliberately the same shape.
 *
 * Switching a school OFF deletes nothing. Their hostels, rooms and the whole
 * residency history stay exactly where they are and come back untouched when it
 * is switched on again. A lapsed renewal must not destroy a year of records,
 * and the confirmation says so in as many words.
 */
function HostelAccess() {
    const { notification: { updateNotification } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [school, setSchool] = useState("");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    async function load() {
        const { schools } = await getHostelAccess();
        setSchools(schools);
        setLoading(false);
    }
    useEffect(() => { load(); }, []);

    const options = useMemo(
        () => schools.map((s) => ({ value: s.id, name: s.name })),
        [schools]
    );
    const current = schools.find((s) => String(s.id) === String(school)) || null;
    const enabled = schools.filter((s) => s.uses_hostel);

    async function onToggle(target, next) {
        const turningOff = !next;
        const ok = await confirmAction({
            tone: turningOff ? "warning" : "info",
            confirmText: turningOff ? "Switch off" : "Switch on",
            title: turningOff
                ? `Switch the hostel module OFF for ${target.name}?`
                : `Switch the hostel module ON for ${target.name}?`,
            body: turningOff
                ? `The school stops seeing the Hostel menu and every hostel page and API stops answering for them. `
                  + `Nothing is deleted — ${target.residents || 0} resident record(s) and all of their rooms and history `
                  + `stay exactly as they are and come back if it is switched on again.`
                : `${target.name} will see a Hostel menu on their next sign-in. They start with nothing set up: `
                  + `they add their hostel, room types and rooms, then admit students.`,
        });
        if (!ok) return;
        setSaving(true);
        const [status, message] = await setHostelAccess(target.id, next);
        setSaving(false);
        if (status === 200) {
            setSchools((prev) => prev.map((s) =>
                String(s.id) === String(target.id) ? { ...s, uses_hostel: next } : s));
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
                title="Hostel module access"
                description={
                    "Which schools have the hostel module: residents, rooms and beds, night roll call, "
                    + "gate passes, visitors, complaints, the mess menu and hostel fees on the student's bill.\n"
                    + "A school without it never sees the Hostel menu, and every hostel page and endpoint refuses them. "
                    + "Switching a school off never deletes their records."
                }>
                <div className="sm:col-span-12 flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-x-1 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-sm font-semibold text-teal-800">
                        <HomeModernIcon className="w-4 h-4" />
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
                                current.uses_hostel
                                    ? "border-green-200 bg-green-50 text-green-800"
                                    : "border-gray-200 bg-gray-100 text-gray-600"}`}>
                                {current.uses_hostel ? "Module ON" : "Module OFF"}
                            </span>
                        </div>
                        {current.uses_hostel && (
                            <p className="mt-3 text-sm text-gray-600">
                                {current.hostels || 0} hostel(s) set up · {current.residents || 0} current resident(s).
                            </p>
                        )}
                    </div>
                    <ButtonsSecion>
                        <Button color={current.uses_hostel ? "red" : "teal"} disabled={saving}
                            onClick={() => onToggle(current, !current.uses_hostel)}
                            className="rounded-lg normal-case font-semibold shadow-sm">
                            {saving ? "Saving…" : current.uses_hostel ? "Switch OFF" : "Switch ON"}
                        </Button>
                    </ButtonsSecion>
                </>
            )}

            <Section title="Schools with the hostel module"
                description="Everyone who currently has it, and what they have built.">
                <div className="sm:col-span-12">
                    {enabled.length < 1
                        ? <p className="text-sm text-gray-500">No school has the hostel module yet.</p>
                        : <BasicTable name="Hostel module — enabled schools"
                            columns={[
                                ["name", "school"],
                                ["address", "address"],
                                ["hostels", "hostels"],
                                ["residents", "residents"],
                            ]}
                            data={enabled} />}
                </div>
            </Section>
        </div>
    );
}

export default HostelAccess;
