import { useAppContext } from "@/contexts/AppContext";
import { UI_THEME_CLASSIC } from "@/configs/uiThemes";
import { SkeletonCards, SkeletonText } from "@/components/Skeleton";
import { getSummary } from "@/services/functions/analysis/summary";
import { useLayoutEffect, useState } from "react";
import UpcomingBirthdaysView from "./UpcomingBirthdaysView";
import DeviceStatusView from "./DeviceStatusView";
import GenderSplit from "./GenderSplit";
import AttendanceToday from "./AttendanceToday";
import CollectionsCard from "./CollectionsCard";
import StationsCard from "./StationsCard";
import { useSMSCredits, creditFacts } from "@/components/views/communication/sms/useSMSCredits";
import {
    AcademicCapIcon, UserGroupIcon, BookOpenIcon, TruckIcon,
    DevicePhoneMobileIcon, CalendarDaysIcon, ReceiptPercentIcon,
    MapPinIcon, TrophyIcon,
} from "@heroicons/react/24/outline";

function CountCard({ label, count }) {
    return (
        <div className="grid grid-rows-2 !gap-y-0 items-center rounded-lg shadow-md py-4 bg-teal-100">
            <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide self-start text-center">{label}</span>
            <span className="text-base text-gray-800 font-semibold self-end justify-self-center capitalize">{count}</span>
        </div>
    );
}

function KpiCard({ label, count, sublabel, Icon }) {
    // `min-w-0` on the text column is what stops a long value being clipped:
    // a flex child defaults to min-width:auto, so it refuses to shrink below its
    // content and the card's `overflow-hidden` simply cut it off — which is how
    // "EY2083/084" rendered as "EY208". With the column allowed to shrink, the
    // value ellipsises (and keeps the full text in a tooltip) instead.
    return (
        // A white tile with its role colour on the icon (globals.css `.app-kpi`,
        // picked by the tile's position). These were gradients with a
        // decorative disc in the corner; the number is the point of the tile,
        // and nothing should compete with it.
        //
        // On a phone the four tiles sit two by two, so each one stands its icon
        // above its figure — beside it, half a phone's width left the value
        // ("EY2083/084") nowhere to go.
        <div className="app-kpi relative overflow-hidden rounded-xl border bg-white p-3.5 sm:p-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="app-kpi-icon shrink-0 rounded-lg bg-white/80 p-1.5 sm:p-2.5">
                {Icon && <Icon className="h-5 w-5 sm:h-7 sm:w-7 text-gray-800" />}
            </div>
            <div className="flex flex-col min-w-0 w-full sm:w-auto">
                <span className="app-kpi-label text-[11px] font-semibold uppercase tracking-wider text-gray-700 leading-snug">{label}</span>
                <span className="app-kpi-value text-xl xl:text-2xl font-bold text-gray-900 leading-tight truncate"
                    title={count === 0 || count ? String(count) : ""}>{count}</span>
                {sublabel && <span className="app-kpi-sub text-[11px] text-gray-700/80 truncate" title={sublabel}>{sublabel}</span>}
            </div>
        </div>
    );
}

function StatTile({ label, value, Icon }) {
    return (
        <div className="app-tile flex items-center gap-3 rounded-lg bg-white/70 shadow-sm p-3 border border-teal-100">
            {Icon && <Icon className="h-6 w-6 text-teal-600 shrink-0" />}
            <div className="flex flex-col">
                <span className="text-xs font-semibold text-[var(--ink-500)]">{label}</span>
                <span className="text-lg font-bold tabular-nums text-[var(--ink-900)]">{value}</span>
            </div>
        </div>
    );
}

// The balance comes from a cache on the server (the provider's own call takes
// the best part of a minute). `useSMSCredits` keeps asking while that cached
// figure is not the latest, and `creditFacts` says when the figure is from —
// the card used to stop at the first number it got and show it with no age.
function SMSCreditsView({ user }) {
    // The /api/sms credits endpoint is admin-only and keyed by the admin's
    // account id; the hook waits for `user` to hydrate (account present).
    const { info, checking } = useSMSCredits(user?.profile?.account, user?.role === "admin");
    const { value, note } = creditFacts(info, checking);
    return (
        <KpiCard
            label="SMS Credits"
            count={info ? value : "-"}
            sublabel={info ? note : "Available balance"}
            Icon={DevicePhoneMobileIcon}
        />
    );
}

function SchoolSummary() {
    const { user: { user }, fiscalYear: { year }, theme } = useAppContext();
    const themed = !!(theme?.uiTheme && theme.uiTheme !== UI_THEME_CLASSIC);
    const [summary, setSummary] = useState();
    const school = user?.profile?.school || user?.profile?.id;

    useLayoutEffect(() => {
        if (user?.profile && year?.economic_year) {
            (async () => {
                const data = await getSummary(user?.profile?.school || user?.profile?.id, year.economic_year);
                setSummary(data);
            })();
        }
    }, [user?.profile?.id]);

    const totalStudents = (summary?.total?.male_students || 0)
        + (summary?.total?.female_students || 0)
        + (summary?.total?.others_students || 0);
    const totalStaffs = (summary?.total?.male_staffs || 0)
        + (summary?.total?.female_staffs || 0)
        + (summary?.total?.others_staffs || 0);

    // Until the summary lands, every `summary?.total?.…` above resolves to 0 —
    // so the dashboard rendered a complete, confident set of KPI cards reading
    // zero students, zero staff and four empty charts, then snapped to the real
    // figures. Showing a zero you have not measured is worse than showing
    // nothing: a head teacher opening the page saw their school as empty.
    if (themed && !summary) {
        return (
            <div className="flex flex-col gap-y-4 mb-5" role="status" aria-busy="true">
                <span className="sr-only">Loading dashboard…</span>
                <SkeletonCards count={4} />
                <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={4} /></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={3} /></div>
                    <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={3} /></div>
                </div>
                <div className="grid lg:grid-cols-2 gap-3">
                    <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={6} /></div>
                    <div className="app-skel-card rounded-xl p-4"><SkeletonText lines={6} /></div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-y-4 mb-5">
            {/* Top KPI row: two by two on a phone, one row on a desktop */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <KpiCard
                    label="Total Students"
                    count={totalStudents}
                    sublabel={year?.academic_year_name || ""}
                    Icon={AcademicCapIcon}
                />
                <KpiCard
                    label="Total Staffs"
                    count={totalStaffs}
                    sublabel="Active employees"
                    Icon={UserGroupIcon}
                />
                <KpiCard
                    label="Running Economic Year"
                    count={year?.economic_year_name || "-"}
                    sublabel={`Accounting: ${year?.accounting_economic_year_name || "-"}`}
                    Icon={CalendarDaysIcon}
                />
                <SMSCreditsView user={user} />
            </div>

            {/* Today, and the year so far: who is in, and what has come in */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                {/* even halves on a small laptop, where five twelfths is too
                    narrow for a ring, a count and who is missing on one line */}
                <div className="lg:col-span-6 xl:col-span-5">
                    <AttendanceToday school={school} />
                </div>
                <div className="lg:col-span-6 xl:col-span-7">
                    <CollectionsCard monthsList={summary?.collections?.months} amounts={summary?.collections?.data}
                        yearName={year?.economic_year_name} today={user?.today} />
                </div>
            </div>

            {/* Reader status — sits under attendance because that is what it
                explains: a roster that looks empty is usually a reader that is
                offline. Renders nothing for a school with no devices. */}
            <DeviceStatusView school={school} />

            {/* Birthdays: side by side even on a phone */}
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                <UpcomingBirthdaysView label="Today student birthdays" role="student" />
                <UpcomingBirthdaysView label="Today staff birthdays" role="staff" />
            </div>

            {/* Who the school is, and how they get there */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5 flex flex-col gap-3">
                    <GenderSplit title="Running Students"
                        counts={{ male: summary?.total?.male_students, female: summary?.total?.female_students, others: summary?.total?.others_students }}
                        emptyHint="No students are enrolled for this academic year yet." />
                    <GenderSplit title="Employed Staffs"
                        counts={{ male: summary?.total?.male_staffs, female: summary?.total?.female_staffs, others: summary?.total?.others_staffs }}
                        emptyHint="No staff records have been added yet." />
                </div>
                <div className="lg:col-span-7">
                    <StationsCard stations={summary?.transportation_services?.stations} counts={summary?.transportation_services?.data} />
                </div>
            </div>

            {/* Detailed stats */}
            {/* five tiles in two columns leave one over: on a phone it takes the full row */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3 [&>*:last-child]:col-span-2 md:[&>*:last-child]:col-span-1">
                <StatTile label="Total Courses" value={summary?.total?.courses || 0} Icon={BookOpenIcon} />
                <StatTile label="Bus Stations" value={summary?.total?.bus_stations || 0} Icon={MapPinIcon} />
                <StatTile label="Transport Enrollments" value={summary?.total?.transportation_enrollments || 0} Icon={TruckIcon} />
                <StatTile label="Student Discounts" value={summary?.total?.student_discounts_count || 0} Icon={ReceiptPercentIcon} />
                <StatTile label="Published Results" value={summary?.total?.published_results || 0} Icon={TrophyIcon} />
            </div>
        </div>
    )
}

export default SchoolSummary;
