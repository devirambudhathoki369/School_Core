import { useEffect, useMemo, useState } from "react";

import { useAppContext } from "@/contexts/AppContext";
import { getParties } from "@/services/functions/extra_billing";

/**
 * The school id every call in this module needs, and the party being worked on.
 * Every page starts with the same three lines, so they live here instead of
 * being copied four times — and "which party" is then answered the same way on
 * every screen.
 */
export function useExtraBillingScope({ autoSelect = false } = {}) {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;
    const [parties, setParties] = useState([]);
    const [party, setParty] = useState("");
    const [loading, setLoading] = useState(true);

    async function reload() {
        if (!school) return;
        const list = await getParties(school);
        setParties(list);
        if (autoSelect) {
            setParty((current) => {
                if (current && list.some((p) => String(p.id) === String(current))) return current;
                return list.length > 0 ? String(list[0].id) : "";
            });
        }
        setLoading(false);
        return list;
    }
    useEffect(() => { reload(); /* eslint-disable-next-line */ }, [school]);

    const options = useMemo(
        () => parties.map((p) => ({
            value: p.id,
            name: p.property_name ? `${p.name} — ${p.property_name}` : p.name,
        })),
        [parties]
    );
    const current = parties.find((p) => String(p.id) === String(party)) || null;
    return { user, school, parties, party, setParty, options, current, loading, reload, updateNotification };
}

/**
 * What a school sees when it has the module but has not set anything up yet.
 * Says what to do next rather than "No records found" — an empty register and a
 * broken register look identical otherwise.
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

/** A small status pill. Colour carries meaning, and so does the WORD — colour
 *  alone is not a label anyone can read out loud. */
export function StatusPill({ text, tone = "gray" }) {
    return (
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${CHIP_COLOURS[tone] || CHIP_COLOURS.gray}`}>
            {text}
        </span>
    );
}

/** Rs. formatting used across this module's tables and tiles. */
export function rs(value) {
    const n = Number(value || 0);
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A figure tile — the row of numbers every page in this module opens with. */
export function Tile({ label, value, tone = "gray", hint }) {
    return (
        <div className={`rounded-lg border p-3 ${CHIP_COLOURS[tone] || CHIP_COLOURS.gray}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
            <p className="text-lg font-bold">{value}</p>
            {hint && <p className="text-[11px] opacity-80">{hint}</p>}
        </div>
    );
}
