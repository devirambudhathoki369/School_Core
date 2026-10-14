import { useEffect, useState } from "react";
import { Button } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { Section, ButtonsSecion } from "@/components/sections";
import Loader from "@/components/Loader";
import { getMessMenu, saveMessMenu } from "@/services/functions/hostel";
import { MEALS, WEEKDAYS } from "@/configs/hostel";
import { HostelPicker, SetupNeeded, useHostelScope } from "../common";

/**
 * THE WEEKLY MESS MENU.
 *
 * Edited as the grid it actually is — seven days across, four meals down — and
 * saved in ONE request. Twenty-eight separate save buttons is not a menu, it is
 * a form somebody gives up on halfway through Wednesday.
 *
 * A cell left blank is DELETED rather than stored as an empty string, so a
 * hostel that serves no evening snack shows an empty cell instead of the word
 * "None" on every row.
 */
function HostelMess() {
    const { notification: { updateNotification } } = useAppContext();
    const { school, hostels, hostel, setHostel, options, loading } = useHostelScope();

    const [menu, setMenu] = useState({});
    const [fetching, setFetching] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dirty, setDirty] = useState(false);

    async function load() {
        if (!hostel) { setMenu({}); return; }
        setFetching(true);
        const { menu } = await getMessMenu(school, hostel);
        setMenu(menu);
        setDirty(false);
        setFetching(false);
    }
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [hostel]);

    function setCell(day, meal, value) {
        setDirty(true);
        setMenu((s) => ({ ...s, [day]: { ...(s[day] || {}), [meal]: value } }));
    }

    async function onSave() {
        setSaving(true);
        const [status, message] = await saveMessMenu(school, hostel, menu);
        setSaving(false);
        if (status === 200) { updateNotification(200, message || "Menu saved!"); setDirty(false); load(); }
        else updateNotification(400, message || "Failed.");
    }

    if (loading) return <Loader />;
    if (hostels.length < 1) return <SetupNeeded what="hostels" where="Hostel > Hostel Setup" />;

    return (
        <div className="flex flex-col gap-y-4">
            <HostelPicker options={options} value={hostel} onChange={setHostel} />

            <Section title="Weekly mess menu"
                description="Type what is served. Leave a cell blank if that meal is not served — a blank cell is cleared, not saved as an empty entry. Everything saves together." />

            {fetching ? <Loader /> : (
                <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                        <table className="w-full text-sm">
                            <thead className="bg-table-header text-left">
                                <tr>
                                    <th className="px-3 py-2 w-28">Day</th>
                                    {MEALS.map((m) => <th key={m.value} className="px-3 py-2">{m.name}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {WEEKDAYS.map((d) => (
                                    <tr key={d.value} className="border-t border-gray-100 align-top">
                                        <td className="px-3 py-2 font-semibold whitespace-nowrap">{d.name}</td>
                                        {MEALS.map((m) => (
                                            <td key={m.value} className="px-2 py-2">
                                                <textarea rows={2}
                                                    value={menu?.[d.value]?.[m.value] || ""}
                                                    onChange={(e) => setCell(d.value, m.value, e.target.value)}
                                                    placeholder="—"
                                                    className="w-full min-w-[9rem] rounded border border-gray-300 px-2 py-1 text-sm" />
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <ButtonsSecion>
                        <Button color="teal" onClick={onSave} disabled={saving || !hostel || !dirty}
                            className="rounded-lg normal-case font-semibold">
                            {saving ? "Saving…" : dirty ? "Save menu" : "Saved"}
                        </Button>
                    </ButtonsSecion>
                </>
            )}
        </div>
    );
}

export default HostelMess;
