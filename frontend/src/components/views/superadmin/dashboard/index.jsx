import { useEffect, useMemo, useState } from "react";
import { SkeletonCards, SkeletonText } from "@/components/Skeleton";
import Link from "next/link";
import {
    BuildingOffice2Icon, SwatchIcon, PaintBrushIcon, CalendarIcon,
    UserIcon, CpuChipIcon, BellAlertIcon, AcademicCapIcon, ChartBarIcon,
    ArrowUturnLeftIcon, IdentificationIcon, BanknotesIcon,
} from "@heroicons/react/24/outline";

import { useAppContext } from "@/contexts/AppContext";
import { fetchSchools } from "@/services/functions/schools";
import { getAllUiThemes } from "@/services/functions/uiThemes";
import { themeMeta } from "@/configs/uiThemes";

/**
 * The superadmin's landing page.
 *
 * Superadmins previously arrived on the School/Admin form — a data-entry screen
 * with no sense of the estate they are responsible for. This answers "what am I
 * looking after and what do I usually do here" first, and every number on it is
 * fetched, not decorative.
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

function Tile({ label, value, sub, Icon, tone }) {
    return (
        <div className={`app-kpi relative overflow-hidden rounded-xl p-4 shadow-md flex items-center gap-4 ${tone}`}>
            <div className="app-kpi-icon shrink-0 rounded-lg bg-white/40 p-2.5">
                <Icon className="h-7 w-7 text-gray-800" />
            </div>
            <div className="flex min-w-0 flex-col">
                <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700">{label}</span>
                <span className="app-kpi-value truncate text-xl font-bold leading-tight text-gray-900 xl:text-2xl">{value}</span>
                {sub && <span className="app-kpi-sub truncate text-[11px] text-gray-700/80">{sub}</span>}
            </div>
        </div>
    );
}

function SuperAdminDashboard() {
    const { user: { user } } = useAppContext();
    const [schools, setSchools] = useState([]);
    const [themed, setThemed] = useState(null);

    useEffect(() => {
        (async () => {
            setSchools((await fetchSchools({}, true)) || []);
            // the theme payload already carries every school with its theme, so
            // the breakdown costs no extra request.
            const { schools: rows } = await getAllUiThemes();
            setThemed(rows || []);
        })();
    }, []);

    const themeBreakdown = useMemo(() => {
        if (!themed) return null;
        const counts = themed.reduce((acc, s) => {
            acc[s.ui_theme] = (acc[s.ui_theme] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([key, n]) => ({ key, n, name: themeMeta(key).name, rail: themeMeta(key).rail }));
    }, [themed]);

    const onClassic = themeBreakdown?.find((t) => t.key === "classic")?.n ?? 0;
    const customised = (themed?.length ?? 0) - onClassic;

    // The console runs permanently on `data-ui-theme="console"` (AppContext
    // applies it for any superadmin role), so there is no Classic branch to
    // guard here — this screen can never render unthemed.
    //
    // Both requests are in flight together, and until they land the tiles show
    // "—" and the literal word "Loading…" as their subtitle. That is honest but
    // it is four boxes of placeholder punctuation; a silhouette of the tiles
    // that are coming reads as the page arriving rather than as the page being
    // broken, and it reserves the same space so nothing jumps when the counts
    // land.
    if (!themed) {
        return (
            <div className="mb-5 flex flex-col gap-y-4" role="status" aria-busy="true">
                <span className="sr-only">Loading console…</span>
                <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={2} /></div>
                <SkeletonCards count={4} />
                <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={5} /></div>
            </div>
        );
    }

    return (
        <div className="mb-5 flex flex-col gap-y-4">
            <div className="app-section">
                <h2 className="text-lg font-bold text-gray-900">
                    Welcome{user?.username ? `, ${user.username}` : ""}
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                    Everything you administer across the system.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Tile label="Schools" value={schools.length || "—"} sub="On the system"
                    Icon={BuildingOffice2Icon} tone="bg-teal-50 border border-teal-100" />
                <Tile label="Custom themes" value={themed ? customised : "—"}
                    sub={themed ? `${onClassic} on Classic` : "Loading…"}
                    Icon={PaintBrushIcon} tone="bg-sky-50 border border-sky-100" />
                <Tile label="Quick actions" value={ROUTINE.length} sub="Setup & reports"
                    Icon={SwatchIcon} tone="bg-emerald-50 border border-emerald-100" />
                <Tile label="Careful actions" value={CAREFUL.length} sub="Year close & repairs"
                    Icon={ArrowUturnLeftIcon} tone="bg-amber-50 border border-amber-100" />
            </div>

            <div className="app-section">
                <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Quick links</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {ROUTINE.map(({ name, view, Icon }) => (
                        <Link key={view} href={`#${view}`}
                            className="app-quicklink flex items-center gap-2.5 rounded-lg border border-blue-gray-50
                                bg-white px-3 py-2.5 text-sm text-gray-800 transition-colors
                                hover:border-teal-300 hover:bg-teal-50">
                            <Icon className="h-5 w-5 shrink-0 opacity-70" />
                            <span className="min-w-0 truncate">{name}</span>
                        </Link>
                    ))}
                </div>
            </div>

            {themeBreakdown?.length > 0 && (
                <div className="app-section">
                    <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">Themes in use</h3>
                    <div className="flex flex-wrap gap-2">
                        {themeBreakdown.map((t) => (
                            <span key={t.key}
                                className="flex items-center gap-2 rounded-full border border-blue-gray-50 bg-white px-3 py-1.5 text-sm">
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: t.rail }} />
                                <span className="text-gray-800">{t.name}</span>
                                <span className="font-semibold tabular-nums text-gray-500">{t.n}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            <div className="app-section">
                <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">Handle with care</h3>
                <p className="mb-3 text-xs text-gray-500">
                    These rewrite or reverse posted financial data. Read the screen before running one.
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {CAREFUL.map(({ name, view }) => (
                        <Link key={view} href={`#${view}`}
                            className="app-quicklink-danger flex items-center gap-2 rounded-lg border border-rose-100
                                bg-rose-50/60 px-3 py-2.5 text-sm text-rose-800 transition-colors hover:bg-rose-50">
                            <ArrowUturnLeftIcon className="h-5 w-5 shrink-0 opacity-70" />
                            <span className="min-w-0 truncate">{name}</span>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}

export default SuperAdminDashboard;
