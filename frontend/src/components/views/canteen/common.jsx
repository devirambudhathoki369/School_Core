import { useEffect, useState } from "react";

import { useAppContext } from "@/contexts/AppContext";
import { getCanteenSettings } from "@/services/functions/canteen";

/**
 * The school id every call in this module needs, today's date by the server's
 * Nepal clock, and the school's canteen settings (defaults when it never saved
 * any — the server answers with them).
 */
export function useCanteenScope() {
    const { user: { user }, notification: { updateNotification } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;
    const today = user?.today_npt || user?.today || "";
    const [settings, setSettings] = useState(null);

    async function reloadSettings() {
        if (!school) return;
        const data = await getCanteenSettings(school);
        setSettings(data && typeof data === "object" && "allow_cash" in data ? data : DEFAULT_SETTINGS);
    }
    useEffect(() => { reloadSettings(); /* eslint-disable-next-line */ }, [school]);

    return { user, school, today, settings, reloadSettings, updateNotification };
}

export const DEFAULT_SETTINGS = {
    run_by: 1, allow_cash: true, allow_account: true, credit_limit: 0, daily_limit: 0,
    notify_parents: true, low_balance: 100, slip_width: 80, slip_footer: "",
};

/** Money added up in whole paisa, so a column of 33.33s never shows 99.99000000000001.
 *  The server is the truth for every figure; this only keeps the screen exact. */
export function paisa(value) {
    return Math.round(Number(value || 0) * 100);
}
export function sumMoney(values) {
    return (values || []).reduce((sum, v) => sum + paisa(v), 0) / 100;
}
export function lineMoney(price, qty) {
    return (paisa(price) * Number(qty || 0)) / 100;
}

/** Rs. formatting used across this module. */
export function rs(value) {
    const n = Number(value || 0);
    return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** A balance said in words as well as colour: owing is not just "red". */
export function balanceText(value) {
    const n = Number(value || 0);
    if (n < 0) return `Owes Rs. ${rs(-n)}`;
    return `Rs. ${rs(n)}`;
}

const CHIP_COLOURS = {
    green: "bg-green-50 text-green-800 border-green-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    red: "bg-rose-50 text-rose-700 border-rose-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    gray: "bg-gray-100 text-gray-700 border-gray-200",
};

/** A small status pill. Colour carries meaning, and so does the WORD. */
export function StatusPill({ text, tone = "gray" }) {
    return (
        <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${CHIP_COLOURS[tone] || CHIP_COLOURS.gray}`}>
            {text}
        </span>
    );
}

export function balanceTone(value) {
    const n = Number(value || 0);
    if (n < 0) return "red";
    if (n === 0) return "gray";
    return "green";
}

/** A figure tile — the row of numbers the module's pages open with. */
export function Tile({ label, value, tone = "gray", hint }) {
    return (
        <div className={`rounded-lg border p-3 min-w-0 ${CHIP_COLOURS[tone] || CHIP_COLOURS.gray}`}>
            <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
            <p className="text-lg font-bold tabular-nums truncate">{value}</p>
            {hint && <p className="text-[11px] opacity-80">{hint}</p>}
        </div>
    );
}

/** What a page shows when there is nothing to work on yet, saying what to do. */
export function SetupNeeded({ what, where }) {
    return (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <p className="text-sm font-semibold text-gray-700">No {what} yet.</p>
            <p className="mt-1 text-xs text-gray-500">{where}</p>
        </div>
    );
}

/** A plain strip of advice — not an error, not a warning. */
export function Note({ children, tone = "blue" }) {
    return (
        <div className={`rounded-lg border px-3 py-2 text-sm ${CHIP_COLOURS[tone] || CHIP_COLOURS.blue}`}>
            {children}
        </div>
    );
}

/** Wraps `fn` so it runs once at a time: a second press while the first is
 *  still with the server does nothing. Every money button here uses it. */
export function useOnce() {
    const [busy, setBusy] = useState(false);
    async function run(fn) {
        if (busy) return;
        setBusy(true);
        try { return await fn(); } finally { setBusy(false); }
    }
    return [busy, run];
}
