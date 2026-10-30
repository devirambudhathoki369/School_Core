import { useAppContext } from "@/contexts/AppContext";
import { SkeletonCards, SkeletonText } from "@/components/Skeleton";
import { getAttendanceToday, getSummary } from "@/services/functions/analysis/summary";
import { useLayoutEffect, useState } from "react";
import UpcomingBirthdaysView from "./UpcomingBirthdaysView";
import DeviceStatusView from "./DeviceStatusView";
import GenderSplit from "./GenderSplit";
import { Greeting, PresentTile, CollectedTodayTile, ClassAttendance, NeedsAttention, SmsTile, SMS_LOW } from "./Today";
import CollectionsCard from "./CollectionsCard";
import StationsCard from "./StationsCard";
import { useSMSCredits, creditFacts } from "@/components/views/communication/sms/useSMSCredits";
import {
    AcademicCapIcon, UserGroupIcon, BookOpenIcon, TruckIcon,
    ReceiptPercentIcon,
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
// figure is not the latest, and `creditFacts` says when the figure is from.
// The hook runs once, in SchoolSummary, which hands the answer to this tile
// and to "Needs attention" — two callers used to mean two polls.
function SMSCreditsView({ info, checking }) {
    const { value, note } = creditFacts(info, checking);
    const credit = Number(value);
    return <SmsTile value={info ? value : "-"} note={info ? note : "Available balance"}
        low={Number.isFinite(credit) && credit < SMS_LOW} />;
}

function SchoolSummary() {
    const { user: { user }, fiscalYear: { year } } = useAppContext();
    const [summary, setSummary] = useState();
    const [att, setAtt] = useState(null);
    const school = user?.profile?.school || user?.profile?.id;
    // The /api/sms credits endpoint is admin-only and keyed by the admin's
    // account id; the hook waits for `user` to hydrate (account present).
    const { info: smsInfo, checking: smsChecking } = useSMSCredits(user?.profile?.account, user?.role === "admin");

    // Today's roll, apart from the summary: it changes through the day, and
    // the tiles, the class list and "Needs attention" all read the same answer.
    useLayoutEffect(() => {
        if (!school) return;
        (async () => setAtt(await getAttendanceToday(school)))();
    }, [school]);

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
    if (!summary) {
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
        <div className="app-dash flex flex-col gap-y-4 mb-5">
            <Greeting />

            {/* Today at a glance: two by two on a phone, one row on a desktop */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
                <PresentTile label="Students present" stats={att?.students} total={totalStudents} Icon={AcademicCapIcon} />
                <PresentTile label="Staff present" stats={att?.staff} total={totalStaffs} Icon={UserGroupIcon} />
                <CollectedTodayTile today={summary?.collected_today} />
                <SMSCreditsView info={smsInfo} checking={smsChecking} />
            </div>

            {/* Who is in, class by class — beside what needs a person today */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7"><ClassAttendance att={att} /></div>
                <div className="lg:col-span-5 flex flex-col gap-3">
                    <NeedsAttention school={school} att={att} smsInfo={smsInfo} />
                    <div className="grid grid-cols-2 lg:grid-cols-1 gap-2.5 sm:gap-3">
                        <UpcomingBirthdaysView label="Student birthdays today" role="student" />
                        <UpcomingBirthdaysView label="Staff birthdays today" role="staff" />
                    </div>
                </div>
            </div>

            {/* The year's money, and how students get to school */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-7">
                    <CollectionsCard monthsList={summary?.collections?.months} amounts={summary?.collections?.data}
                        yearName={year?.economic_year_name} today={user?.today} />
                </div>
                <div className="lg:col-span-5">
                    <StationsCard stations={summary?.transportation_services?.stations} counts={summary?.transportation_services?.data} />
                </div>
            </div>

            {/* Reader status explains a roll that looks empty. Renders nothing
                for a school with no devices; "Needs attention" scrolls here. */}
            <div id="dash-devices" className="scroll-mt-4">
                <DeviceStatusView school={school} />
            </div>

            {/* Who the school is */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <GenderSplit title="Running Students"
                    counts={{ male: summary?.total?.male_students, female: summary?.total?.female_students, others: summary?.total?.others_students }}
                    emptyHint="No students are enrolled for this academic year yet." />
                <GenderSplit title="Employed Staffs"
                    counts={{ male: summary?.total?.male_staffs, female: summary?.total?.female_staffs, others: summary?.total?.others_staffs }}
                    emptyHint="No staff records have been added yet." />
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
