import { useLayoutEffect, useState } from "react";
import { AcademicCapIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { getAttendanceToday } from "@/services/functions/analysis/summary";

/**
 * A share of a whole, drawn as a ring: the filled arc is the share, the track
 * under it is a lighter step of the same colour. The figure it stands for sits
 * in the middle, so the drawing is never the only way to read it.
 */
export function Ring({ percent, colour, size = 96, stroke = 9, children }) {
    const radius = (size - stroke) / 2;
    const around = 2 * Math.PI * radius;
    const share = Math.max(0, Math.min(100, Number(percent) || 0));
    return (
        <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke}
                    style={{ stroke: `color-mix(in srgb, ${colour} 15%, #fff)` }} />
                {share > 0 &&
                    <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
                        strokeDasharray={`${(around * share) / 100} ${around}`}
                        style={{ stroke: colour, transition: "stroke-dasharray .45s ease" }} />}
            </svg>
            <span className="absolute inset-0 grid place-items-center">{children}</span>
        </span>
    );
}

// One roster — students or staff — as a row: how much of it is here as a ring,
// the count beside it, and who is missing at the far end. The colour is the
// roster's own (the same one its summary tile wears), never a verdict on the
// number.
function Roster({ label, Icon, stats, colour }) {
    const total = stats?.total || 0;
    const present = Math.min(stats?.present || 0, total);
    const absent = stats?.absent ?? Math.max(total - present, 0);
    const percent = total > 0 ? Math.round((present / total) * 100) : 0;
    return (
        <div className="flex min-w-0 items-center gap-x-4 py-3 first:pt-0 last:pb-0">
            <Ring percent={percent} colour={colour} size={84} stroke={8}>
                {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                <span className="text-[1.05rem] font-extrabold leading-none tabular-nums text-[var(--ink-900)]">{percent}%</span>
            </Ring>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-x-1.5">
                    <Icon className="h-4 w-4 shrink-0" style={{ color: colour }} aria-hidden="true" />
                    <span className="text-[13px] font-semibold text-[var(--ink-600)]">{label}</span>
                </div>
                <div className="mt-1 flex items-baseline gap-x-1.5">
                    <span className="text-[1.6rem] font-extrabold leading-none tabular-nums text-[var(--ink-900)]">{present}</span>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-[var(--ink-500)]">of {total} present</span>
                </div>
            </div>
            <div className="min-w-0 text-right">
                {total === 0
                    ? <span className="text-xs font-medium text-[var(--ink-500)]">Nobody on this roster</span>
                    : present === 0
                        // an untaken register and an empty school look the same to
                        // the count; say what is known rather than "673 absent" in red
                        ? <span className="block max-w-[6rem] text-xs font-medium leading-snug text-[var(--ink-500)]">No one marked present yet</span>
                        : absent > 0
                            ? (
                                <>
                                    <span className="block text-[1.15rem] font-extrabold leading-none tabular-nums text-[#be123c]">{absent}</span>
                                    <span className="mt-1 block text-xs font-semibold text-[var(--ink-500)]">absent</span>
                                </>
                            )
                            : <span className="text-xs font-semibold text-[#047857]">Everyone is in</span>}
            </div>
        </div>
    );
}

/** Today's headcount, students and staff. Live — asked each time the dashboard opens. */
function AttendanceToday({ school }) {
    const [att, setAtt] = useState(null);
    useLayoutEffect(() => {
        if (!school) return;
        (async () => setAtt(await getAttendanceToday(school)))();
    }, [school]);
    return (
        <div className="app-panel flex h-full flex-col rounded-xl border bg-white p-4">
            <div className="flex items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Today&apos;s attendance</h3>
                {att?.date && <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--ink-500)]">{att.date}</span>}
            </div>
            <div className="mt-3 flex flex-1 flex-col justify-center divide-y divide-[var(--line-soft)]">
                <Roster label="Students" Icon={AcademicCapIcon} stats={att?.students} colour="var(--k1)" />
                <Roster label="Staff" Icon={UserGroupIcon} stats={att?.staff} colour="var(--k2)" />
            </div>
        </div>
    );
}

export default AttendanceToday;
