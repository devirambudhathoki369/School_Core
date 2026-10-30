import { useEffect, useMemo, useState } from "react";
import { SkeletonCards, SkeletonText } from "@/components/Skeleton";
import Link from "next/link";
import {
    BuildingOffice2Icon, SwatchIcon, PaintBrushIcon, CalendarIcon, CalendarDaysIcon,
    UserIcon, CpuChipIcon, BellAlertIcon, AcademicCapIcon, ChartBarIcon, CheckCircleIcon,
    ArrowUturnLeftIcon, IdentificationIcon, BanknotesIcon, ExclamationTriangleIcon,
    DevicePhoneMobileIcon, ClockIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { getSchoolAdmins } from "@/services/functions/schools";
import { themeMeta, UI_THEMES } from "@/configs/uiThemes";
import { SCHOOL_MODULES } from "@/configs/moduleGates";
import { Tile, Meter, bsDateLong } from "@/components/views/reports/dashboards/school/Today";

/**
 * The superadmin's landing page: the estate at a glance.
 *
 * Every figure is read from the schools themselves (`/api/admins`, one request
 * the School/Admin screen already makes). Test accounts are counted apart and
 * left out of every share, so a demo school never inflates adoption.
 *
 * Charts follow the dashboard's data-viz rules: a ranked list of bars is one
 * series in the accent alone, its figure printed at the tip; a licence's state
 * is said with an icon and words, never colour alone.
 */

// Where a superadmin actually spends their time. Grouped so the destructive
// and the routine never sit in the same block.
const ROUTINE = [
    { name: "School / Admin", view: "setup.client", Icon: BuildingOffice2Icon },
    { name: "Economic Year", view: "setup.economic-year", Icon: CalendarIcon },
    { name: "Staff Roles", view: "setup.staff-roles", Icon: UserIcon },
    { name: "RFID Devices", view: "setup.rfid-devices", Icon: CpuChipIcon },
    { name: "Splash Notice", view: "setup.splash", Icon: BellAlertIcon },
    { name: "Education Levels", view: "setup.education-levels", Icon: AcademicCapIcon },
    { name: "Grade sheet style", view: "setup.gradesheet-style", Icon: SwatchIcon },
    { name: "Interface Theme", view: "ui-theme", Icon: PaintBrushIcon },
    { name: "Shareholders", view: "setup.shareholders", Icon: BanknotesIcon },
    { name: "ID Cards", view: "cards.download", Icon: IdentificationIcon },
    { name: "School Statistics", view: "analysis.statistics", Icon: ChartBarIcon },
    { name: "Classwise Old Dues", view: "analysis.cw-old-dues", Icon: ChartBarIcon },
];

const CAREFUL = [
    { name: "Undo Academic Year Close", view: "manage.undo-academic-year-close" },
    { name: "Undo Accounting Year Close", view: "manage.undo-accounting-economic-year-close" },
    { name: "Clean Student Ledger posting", view: "manage.clean-student-ledger-posting" },
];

// Facilities as the school form names them, plus the two services sold apart.
const FACILITIES = [
    ...SCHOOL_MODULES.map(({ flag, label }) => ({ flag, label })),
    { flag: "uses_sms", label: "SMS" },
    { flag: "uses_mobile_app", label: "Mobile app" },
];

const BS_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The same BS day one month on ("2083-12-20" → "2084-01-20"). Dates are
 *  zero-padded strings, so they order correctly as text. */
function monthAfter(bs) {
    const m = BS_DATE.exec(bs || "");
    if (!m) return null;
    let [y, mo] = [Number(m[1]), Number(m[2]) + 1];
    if (mo > 12) { mo = 1; y += 1; }
    return `${y}-${String(mo).padStart(2, "0")}-${m[3]}`;
}

function greeting(hour) {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

/** One series of counts, ranked: bars from a single baseline in the accent,
 *  the count and share at the tip. Every figure is printed — this list is
 *  its own table view. */
function RankedBars({ id, title, sub, rows, total, swatch }) {
    const most = Math.max(1, ...rows.map((r) => r.n));
    return (
        <section aria-labelledby={id} className="app-panel flex h-full flex-col gap-4 rounded-xl bg-white p-5 sm:px-6">
            <div>
                <h2 id={id} className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">{title}</h2>
                <p className="text-[0.8125rem] leading-5 text-[var(--ink-600)]">{sub}</p>
            </div>
            {rows.length === 0
                ? <p className="text-[0.875rem] text-[var(--ink-500)]">Nothing to count yet.</p>
                : <table className="w-full border-collapse">
                    <caption className="sr-only">{title}: {sub}</caption>
                    <thead className="sr-only">
                        <tr><th scope="col">Name</th><th scope="col">Schools</th><th scope="col">Count</th><th scope="col">Share</th></tr>
                    </thead>
                    <tbody>
                        {rows.map((r) => (
                            <tr key={r.key} className="app-dash-class">
                                <th scope="row" className="w-[9.5rem] py-[5px] pr-3 text-left text-[0.8125rem] font-normal text-[var(--ink-700)]">
                                    <span className="flex min-w-0 items-center gap-2">
                                        {swatch && <span className="h-3 w-3 shrink-0 rounded-[3px] border border-[rgb(17_24_39/.12)]" style={{ background: r.swatch }} aria-hidden="true" />}
                                        <span className="truncate" title={r.label}>{r.label}</span>
                                    </span>
                                </th>
                                <td className="py-[5px] pr-3" aria-hidden="true">
                                    <span className="block h-2.5">
                                        <span className="app-dash-bar block h-full rounded-r-[4px]"
                                            style={{ width: `${r.n ? Math.max(2, (r.n / most) * 100) : 0}%`, background: "var(--viz-accent)" }} />
                                    </span>
                                </td>
                                <td className="w-[2.5rem] py-[5px] text-right text-[0.8125rem] font-semibold tabular-nums text-[var(--ink-900)]">{r.n}</td>
                                <td className="w-[3.5rem] py-[5px] pl-2 text-right text-[0.75rem] tabular-nums text-[var(--ink-500)]">
                                    {total ? `${Math.round((r.n / total) * 100)}%` : "–"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>}
        </section>
    );
}

/** Licences whose renewal date has passed, then those due within a month. */
function Renewals({ lapsed, dueSoon }) {
    const rows = [
        ...lapsed.map((s) => ({ ...s, state: "lapsed" })),
        ...dueSoon.map((s) => ({ ...s, state: "due" })),
    ];
    const shown = rows.slice(0, 7);
    return (
        <section aria-labelledby="sa-renewals" className="app-panel flex h-full flex-col rounded-xl bg-white px-5 pb-3 pt-5 sm:px-6">
            <div className="flex items-center justify-between gap-3 pb-2">
                <div>
                    <h2 id="sa-renewals" className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Licence renewals</h2>
                    <p className="text-[0.8125rem] leading-5 text-[var(--ink-600)]">Renewal date passed, then due within a month</p>
                </div>
                {rows.length > 0 &&
                    <span className="h-6 rounded-full bg-[var(--line-soft)] px-2 text-[0.75rem] font-semibold leading-6 tabular-nums text-[var(--ink-700)]">{rows.length}</span>}
            </div>
            {rows.length === 0
                ? <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                    <CheckCircleIcon className="h-8 w-8 text-[var(--st-ok-ink)]" aria-hidden="true" />
                    <p className="text-[0.9375rem] font-semibold text-[var(--ink-900)]">Every licence is current</p>
                    <p className="max-w-[16rem] text-[0.8125rem] leading-5 text-[var(--ink-600)]">No school renews within the next month.</p>
                </div>
                : <ul className="flex flex-col">
                    {shown.map((s) => (
                        <li key={s.id} className="app-dash-attention flex items-center gap-3 border-t border-[var(--line-soft)] py-3">
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${s.state === "lapsed" ? "bg-[var(--st-bad-bg)] text-[var(--st-bad-ink)]" : "bg-[var(--st-warn-bg)] text-[var(--st-warn-ink)]"}`}>
                                {s.state === "lapsed"
                                    ? <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                                    : <ClockIcon className="h-4 w-4" aria-hidden="true" />}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[0.875rem] font-semibold leading-5 text-[var(--ink-900)]" title={s.name}>{s.name}</p>
                                <p className="text-[0.8125rem] leading-5 text-[var(--ink-600)]">
                                    {s.state === "lapsed" ? "Renewal date passed" : "Renews"} · {bsDateLong(s.renew_date)}
                                </p>
                            </div>
                        </li>
                    ))}
                    {rows.length > shown.length &&
                        <li className="border-t border-[var(--line-soft)] py-3 text-[0.8125rem] text-[var(--ink-600)]">
                            and {rows.length - shown.length} more — see School / Admin
                        </li>}
                </ul>}
        </section>
    );
}

function SuperAdminDashboard() {
    const { user: { user } } = useAppContext();
    const [schools, setSchools] = useState(null);

    useEffect(() => {
        (async () => {
            const rows = await getSchoolAdmins();
            setSchools(Array.isArray(rows) ? rows : []);
        })();
    }, []);

    const today = user?.today;
    const facts = useMemo(() => {
        if (!schools) return null;
        const live = schools.filter((s) => !s.test_account);
        const valid = live.filter((s) => BS_DATE.test(s.renew_date || ""));
        const horizon = monthAfter(today);
        const lapsed = today ? valid.filter((s) => s.renew_date < today).sort((a, b) => a.renew_date.localeCompare(b.renew_date)) : [];
        const dueSoon = today && horizon
            ? valid.filter((s) => s.renew_date >= today && s.renew_date <= horizon).sort((a, b) => a.renew_date.localeCompare(b.renew_date))
            : [];
        const facilities = FACILITIES
            .map(({ flag, label }) => ({ key: flag, label, n: live.filter((s) => s[flag]).length }))
            .sort((a, b) => b.n - a.n);
        // A key no theme names (hand-typed, or retired) is drawn as Core, as the app draws it.
        const byTheme = live.reduce((acc, s) => {
            const key = themeMeta(s.ui_theme).value;
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        const themes = UI_THEMES
            .map((t) => ({ key: t.value, label: t.name, n: byTheme[t.value] || 0, swatch: t.swatches[0] }))
            .sort((a, b) => b.n - a.n);
        const onApp = live.filter((s) => s.uses_mobile_app).length;
        return { live, tests: schools.length - live.length, lapsed, dueSoon, facilities, themes, onApp };
    }, [schools, today]);

    if (!facts) {
        return (
            <div className="mb-5 flex flex-col gap-y-4" role="status" aria-busy="true">
                <span className="sr-only">Loading console…</span>
                <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={2} /></div>
                <SkeletonCards count={4} />
                <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={5} /></div>
            </div>
        );
    }

    const { live, tests, lapsed, dueSoon, facilities, themes, onApp } = facts;
    const nextDue = dueSoon[0];
    return (
        <div className="app-dash mb-5 flex flex-col gap-y-4">
            <div className="app-dash-greeting flex flex-col gap-1 pt-1">
                <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.015em] text-[var(--ink-900)]">
                    {greeting(new Date().getHours())}{user?.username ? `, ${user.username}` : ""}
                </h1>
                <p className="text-[0.875rem] leading-5 text-[var(--ink-600)]">
                    Every school on SchoolCore{today ? `, ${new Date().toLocaleDateString("en-US", { weekday: "long" })} ${bsDateLong(today)}` : ""}.
                </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <Tile label="Schools" Icon={BuildingOffice2Icon}>
                    <span className="app-kpi-value text-[1.75rem] leading-9">{live.length}</span>
                    <span className="app-kpi-sub mt-auto text-[0.8125rem] leading-5">
                        {tests ? `Live · ${tests} test account${tests === 1 ? "" : "s"} apart` : "Live, no test accounts"}
                    </span>
                </Tile>
                <Tile label="Renewing within a month" Icon={CalendarDaysIcon}>
                    <span className="app-kpi-value text-[1.75rem] leading-9">{dueSoon.length}</span>
                    <span className="app-kpi-sub mt-auto truncate text-[0.8125rem] leading-5" title={nextDue?.name}>
                        {nextDue ? `Next: ${nextDue.name}, ${bsDateLong(nextDue.renew_date)}` : "None due"}
                    </span>
                </Tile>
                <Tile label="Renewal date passed" Icon={ExclamationTriangleIcon}>
                    <span className="app-kpi-value text-[1.75rem] leading-9">{lapsed.length}</span>
                    <span className={`app-kpi-sub mt-auto text-[0.8125rem] leading-5 ${lapsed.length ? "!text-[var(--st-bad-ink)]" : ""}`}>
                        {lapsed.length ? "Each closes 15 days after its date unless renewed" : "Every licence is current"}
                    </span>
                </Tile>
                <Tile label="On the mobile app" Icon={DevicePhoneMobileIcon}>
                    <span className="flex items-baseline gap-1.5">
                        <span className="app-kpi-value text-[1.75rem] leading-9">{onApp}</span>
                        <span className="text-[0.875rem] font-medium text-[var(--ink-600)]">of {live.length}</span>
                    </span>
                    <Meter share={live.length ? (onApp / live.length) * 100 : 0} />
                    <span className="app-kpi-sub text-[0.8125rem] leading-5">
                        {live.length ? `${Math.round((onApp / live.length) * 100)}% of live schools` : "No live schools yet"}
                    </span>
                </Tile>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7">
                    <RankedBars id="sa-facilities" title="Facilities in use"
                        sub={`Live schools granted each facility, of ${live.length}`}
                        rows={facilities} total={live.length} />
                </div>
                <div className="lg:col-span-5">
                    <Renewals lapsed={lapsed} dueSoon={dueSoon} />
                </div>
            </div>

            <RankedBars id="sa-themes" title="Themes in use" swatch
                sub={`Live schools on each interface theme, of ${live.length}`}
                rows={themes} total={live.length} />

            <section className="app-panel rounded-xl bg-white p-5 sm:px-6" aria-labelledby="sa-links">
                <h2 id="sa-links" className="mb-3 text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Quick links</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {ROUTINE.map(({ name, view, Icon }) => (
                        <Link key={view} href={`#${view}`}
                            className="app-quicklink flex items-center gap-2.5 rounded-[10px] border border-[var(--line)]
                                bg-white px-3 py-2.5 text-[0.875rem] text-[var(--ink-800)] transition-colors
                                hover:border-[var(--t-brand-line)] hover:bg-[var(--t-brand-tint)]">
                            <Icon className="h-5 w-5 shrink-0 text-[var(--ink-500)]" aria-hidden="true" />
                            <span className="min-w-0 truncate">{name}</span>
                        </Link>
                    ))}
                </div>
            </section>

            <section className="app-panel rounded-xl bg-white p-5 sm:px-6" aria-labelledby="sa-careful">
                <h2 id="sa-careful" className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Handle with care</h2>
                <p className="mb-3 text-[0.8125rem] leading-5 text-[var(--ink-600)]">
                    These rewrite or reverse posted financial data. Read the screen before running one.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {CAREFUL.map(({ name, view }) => (
                        <Link key={view} href={`#${view}`}
                            className="app-quicklink-danger flex items-center gap-2 rounded-[10px] border border-[var(--st-bad-line)]
                                bg-[var(--st-bad-bg)] px-3 py-2.5 text-[0.875rem] text-[var(--st-bad-ink)] transition-colors hover:bg-[var(--st-bad-bg-hover)]">
                            <ArrowUturnLeftIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 truncate">{name}</span>
                        </Link>
                    ))}
                </div>
            </section>
        </div>
    );
}

export default SuperAdminDashboard;
