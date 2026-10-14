import { useEffect, useMemo, useState } from "react";
import { Chip } from "@material-tailwind/react";

import { useAppContext } from "@/contexts/AppContext";
import { SelectInput } from "@/components/inputs";
import { Section } from "@/components/sections";
import { getHostels } from "@/services/functions/hostel";

/**
 * The school id every hostel call needs, and the hostel currently being worked
 * on. Every page in this module starts with the same two lines, so they live
 * here instead of being copied eleven times — and the "which hostel" question
 * is answered the same way on every screen as a result.
 */
export function useHostelScope({ autoSelect = true } = {}) {
    const { user: { user } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;
    const [hostels, setHostels] = useState([]);
    const [hostel, setHostel] = useState("");
    const [loading, setLoading] = useState(true);

    async function reload() {
        if (!school) return;
        const list = await getHostels(school);
        setHostels(list);
        // A school with exactly one hostel — which is most of them — should
        // never be asked to pick it. The picker still renders when there are
        // several, and disappears entirely when there is one.
        if (autoSelect) {
            setHostel((current) => {
                if (current && list.some((h) => String(h.id) === String(current))) return current;
                return list.length > 0 ? String(list[0].id) : "";
            });
        }
        setLoading(false);
    }
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [school]);

    const options = useMemo(
        () => hostels.map((h) => ({ value: h.id, name: h.name })),
        [hostels]
    );
    const current = hostels.find((h) => String(h.id) === String(hostel)) || null;
    return { user, school, hostels, hostel, setHostel, options, current, loading, reload };
}

/** The "which hostel" row. Renders nothing when there is only one to choose. */
export function HostelPicker({ options, value, onChange, label = "Hostel", children }) {
    if ((options?.length || 0) < 2 && !children) return null;
    return (
        <Section title={null} description={null}>
            {options.length > 1 && (
                <SelectInput input={{ name: "hostel", label, options }} value={value}
                    onChange={({ value }) => onChange(value)} />
            )}
            {children}
        </Section>
    );
}

/**
 * The message a school sees when it has the module but has not set anything up
 * yet. Deliberately says what to do next rather than "No records found" — an
 * empty hostel register and a broken hostel register look identical otherwise.
 */
export function SetupNeeded({ what, where }) {
    return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-semibold text-gray-700">No {what} yet.</p>
            <p className="mt-1 text-xs text-gray-500">Add one in {where} first.</p>
        </div>
    );
}

const CHIP_COLOURS = {
    green: "bg-green-50 text-green-800 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
};

/** A small status pill. Colour carries meaning, the WORD carries the meaning
 *  too — colour alone is not a label anyone can read out loud. */
export function StatusPill({ text, tone = "gray" }) {
    return (
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${CHIP_COLOURS[tone] || CHIP_COLOURS.gray}`}>
            {text}
        </span>
    );
}

/** Rs. formatting used across the module's tables and tiles. */
export function rs(value) {
    const n = Number(value || 0);
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
