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

/**
 * The canteen's tab bar: the student profile's bar (`app-profile-tab`), so it takes
 * the school's theme colour the same way. Tabs wrap rather than scroll, so none is
 * ever out of sight. One Tab press enters it, then the arrows move within it.
 *
 * `tabs` is [{ key, label, icon, count }]; icon and count are optional. A page
 * draws each tab's content in a <TabPanel>.
 */
export function CanteenTabs({ tabs, active, onChange, label, className = "" }) {
    function onKeyDown(e) {
        const i = tabs.findIndex((t) => t.key === active);
        const steps = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
        if (!(e.key in steps)) return;
        e.preventDefault();
        const next = tabs[(steps[e.key] + tabs.length) % tabs.length].key;
        onChange(next);
        requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
    }
    return (
        <nav className={`rounded-xl bg-white shadow-sm border border-blue-gray-100 ${className}`}>
            <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex flex-wrap gap-1 p-1.5">
                {tabs.map((t) => {
                    const on = t.key === active;
                    const Icon = t.icon;
                    return (
                        <button key={t.key} type="button" role="tab" id={`tab-${t.key}`} aria-controls={`panel-${t.key}`}
                            aria-selected={on} tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)}
                            className={`app-profile-tab flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${on
                                ? "app-profile-tab-active bg-teal-600 text-white shadow-sm ring-1 ring-teal-700/20"
                                : "text-blue-gray-600 hover:bg-teal-50 hover:text-teal-800"}`}>
                            {Icon && <Icon aria-hidden="true" className={`h-[1.05rem] w-[1.05rem] shrink-0 stroke-[1.7] ${on ? "" : "opacity-70"}`} />}
                            {t.label}
                            {t.count !== undefined && (
                                <span className={`min-w-[1.35rem] rounded-full px-1.5 py-px text-center text-[0.7rem] font-bold tabular-nums ${on
                                    ? "bg-white/25 text-white" : "bg-blue-gray-50 text-blue-gray-600"}`}>
                                    {t.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </nav>
    );
}

export function TabPanel({ tab, children, className = "flex flex-col gap-y-4" }) {
    return <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={className}>{children}</div>;
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
