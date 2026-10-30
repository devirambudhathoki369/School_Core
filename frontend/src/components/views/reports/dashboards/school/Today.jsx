import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useAppContext } from "@/contexts/AppContext";
import { fetchSchoolDevices } from "@/services/functions/rfid";
import { months } from "@/components/inputs/options/months";
import {
    AcademicCapIcon, BanknotesIcon, CalendarDaysIcon, ChatBubbleLeftRightIcon, CheckCircleIcon,
    CpuChipIcon, ExclamationTriangleIcon, PlusIcon, ReceiptPercentIcon, UserGroupIcon,
} from "@heroicons/react/24/outline";

export const SMS_LOW = 500;

/* The dashboard's "today" layer: who is in, what has come in, and what needs a
   person. Every figure here is one the server measured today — nothing is
   inferred, and a block with nothing to say says so instead of showing zero. */

const rupees = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
const titleCase = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** "2083-07-13" → "13 Kartik 2083". The server's BS date, never the browser's. */
export function bsDateLong(bs) {
    const [y, m, d] = String(bs || "").split("-").map(Number);
    if (!y || !m || !d) return "";
    return `${d} ${titleCase(months[m] || "")} ${y}`;
}

function greeting(hour) {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

/* ---------------------------------------------------------------- greeting */
export function Greeting() {
    const { user: { user }, menu: { menus, setSelectedMenu } } = useAppContext();
    const router = useRouter();
    // A staff sign-in carries the person's name; an admin's profile IS the
    // school, so it is greeted without one rather than as "Good morning, <school>".
    const person = user?.role === "staff" ? String(user?.profile?.name || "").trim().split(/\s+/)[0] : "";
    const school = user?.profile?.school_name || (user?.role === "admin" ? user?.profile?.name : "");
    const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
    const today = bsDateLong(user?.today);
    // Offered only where this sign-in can actually open the page.
    const views = menus?.views || {};
    const actions = [
        { view: "enrollment.student", label: "Admit student", Icon: PlusIcon, primary: false },
        { view: "payment.student", label: "Collect fee", Icon: BanknotesIcon, primary: true },
    ].filter((a) => views[a.view]);
    const open = (view) => {
        setSelectedMenu(view);
        router.push(`#${view}`);
    };
    return (
        <div className="app-dash-greeting flex flex-wrap items-end justify-between gap-4 pt-1">
            <div className="flex min-w-0 flex-col gap-1">
                <h1 className="text-[1.75rem] font-semibold leading-9 tracking-[-0.015em] text-[var(--ink-900)]">
                    {greeting(new Date().getHours())}{person ? `, ${person}` : ""}
                </h1>
                <p className="text-[0.875rem] leading-5 text-[var(--ink-600)]">
                    {school ? <>Here is <span className="font-medium text-[var(--ink-800)]">{school}</span> today</> : "Here is your school today"}
                    {today && <>, {weekday} {today}</>}.
                </p>
            </div>
            {actions.length > 0 &&
                <div className="flex flex-wrap gap-2">
                    {actions.map(({ view, label, Icon, primary }) => (
                        <button key={view} type="button" onClick={() => open(view)}
                            className={`app-dash-action inline-flex h-10 items-center gap-2 rounded-[10px] px-4 text-[0.875rem] font-semibold normal-case ${primary
                                ? "app-dash-action-primary"
                                : "app-dash-action-secondary"}`}>
                            <Icon className="h-4 w-4" aria-hidden="true" />
                            {label}
                        </button>
                    ))}
                </div>}
        </div>
    );
}

/* ------------------------------------------------------------------- tiles */
// A ratio against its whole. The unfilled track is a lighter step of the
// fill's own ramp, so the state reads across the whole bar.
function Meter({ share, tone = "var(--viz-accent)", track = "var(--viz-accent-track)" }) {
    const pct = Math.max(0, Math.min(100, share));
    return (
        <span className="app-dash-meter block h-2 overflow-hidden rounded-full" style={{ background: track }} aria-hidden="true">
            <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
        </span>
    );
}

function Tile({ label, Icon, children }) {
    return (
        <div className="app-kpi app-dash-tile flex flex-col gap-2 rounded-xl bg-white p-4 sm:p-5">
            <span className="flex items-center gap-2">
                {Icon && <span className="app-kpi-icon grid h-7 w-7 shrink-0 place-items-center rounded-lg">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                </span>}
                <span className="app-kpi-label text-[0.8125rem] leading-5">{label}</span>
            </span>
            {children}
        </div>
    );
}

/** Students or staff in today, as a share of the roster. */
export function PresentTile({ label, stats, Icon, total }) {
    const roster = stats?.total ?? total ?? 0;
    const present = Math.min(stats?.present || 0, roster);
    const share = roster ? (present / roster) * 100 : 0;
    return (
        <Tile label={label} Icon={Icon}>
            <span className="flex items-baseline gap-1.5">
                <span className="app-kpi-value text-[1.75rem] leading-9">{stats ? present.toLocaleString("en-IN") : "–"}</span>
                <span className="text-[0.875rem] font-medium text-[var(--ink-600)]">of {roster.toLocaleString("en-IN")}</span>
            </span>
            <Meter share={share} />
            <span className="app-kpi-sub text-[0.8125rem] leading-5">
                {!stats ? "Checking…"
                    : roster === 0 ? "Nobody on this roster"
                        : present === 0 ? "No one marked present yet"
                            : `${share.toFixed(1)}% · ${(roster - present).toLocaleString("en-IN")} not in`}
            </span>
        </Tile>
    );
}

/** The SMS balance, in the same shape as the other tiles. */
export function SmsTile({ value, note, low }) {
    return (
        <Tile label="SMS credits" Icon={ChatBubbleLeftRightIcon}>
            <span className="app-kpi-value text-[1.75rem] leading-9">
                {typeof value === "number" ? value.toLocaleString("en-IN") : value}
            </span>
            <span className={`app-kpi-sub mt-auto text-[0.8125rem] leading-5 ${low ? "!text-[#8A5300]" : ""}`}>
                {low ? `Running low · ${note}` : note}
            </span>
        </Tile>
    );
}

// A payment mode keeps its colour whatever else came in today: colour follows
// the entity, never its position in the day's list.
const MODE_SLOT = { 1: "var(--viz-1)", 2: "var(--viz-2)", 3: "var(--viz-3)", 4: "var(--viz-4)" };

/** Money received today, and how it came in: one thin segmented bar, its
 *  shares printed beside a swatch for each mode (never colour alone). */
export function CollectedTodayTile({ today }) {
    const amount = Number(today?.amount) || 0;
    const modes = (today?.by_mode || []).filter((m) => Number(m.amount) > 0);
    const share = (m) => Math.round((Number(m.amount) / amount) * 100);
    return (
        <Tile label="Collected today" Icon={BanknotesIcon}>
            <span className="app-kpi-value text-[1.75rem] leading-9">{today ? rupees(amount) : "–"}</span>
            {amount > 0
                ? <span role="img" className="flex h-2 gap-[2px]"
                    aria-label={`Collected today by payment mode: ${modes.map((m) => `${titleCase(m.label)} ${rupees(m.amount)} (${share(m)}%)`).join(", ")}`}>
                    {modes.map((m) => (
                        <span key={m.mode} className="app-dash-seg h-full first:rounded-l-full last:rounded-r-full"
                            title={`${titleCase(m.label)}: ${rupees(m.amount)} (${share(m)}%)`}
                            style={{ flex: `${Number(m.amount)} 1 0`, minWidth: 3, background: MODE_SLOT[m.mode] || "var(--viz-deemph)" }} />
                    ))}
                </span>
                : <Meter share={0} />}
            <span className="app-kpi-sub flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[0.8125rem] leading-5">
                {!today ? "Checking…"
                    : !today.receipts ? "No receipts yet today"
                        : <>
                            {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                            <span className="text-[0.8125rem]">{today.receipts} receipt{today.receipts === 1 ? "" : "s"}</span>
                            {modes.map((m) => (
                                <span key={m.mode} className="inline-flex items-center gap-1 text-[0.8125rem]">
                                    <span className="h-2 w-2 rounded-[2px]" style={{ background: MODE_SLOT[m.mode] || "var(--viz-deemph)" }} aria-hidden="true" />
                                    {titleCase(m.label)} {share(m)}%
                                </span>
                            ))}
                        </>}
            </span>
        </Tile>
    );
}

/* --------------------------------------------------- attendance by class */
const TARGET = 90;

/**
 * Each class's share of its roll, as a table of meters against a 90% target.
 * The rows ARE the table view: every figure is printed, so nothing hides in a
 * hover. A class below target wears the status warning — never a series
 * colour — and always says so with an icon and words, not by colour alone.
 */
export function ClassAttendance({ att }) {
    const classes = att?.classes || [];
    const below = classes.filter((c) => c.present && (c.present / c.total) * 100 < TARGET).length;
    return (
        <section aria-labelledby="dash-class-att" className="app-panel flex h-full flex-col gap-4 rounded-xl bg-white p-5 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 id="dash-class-att" className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Attendance by class</h2>
                    <p className="text-[0.8125rem] leading-5 text-[var(--ink-600)]">
                        Present out of enrolled{att?.date ? ` · ${bsDateLong(att.date)}` : ""}
                    </p>
                </div>
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.75rem] text-[var(--ink-600)]">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-[var(--viz-accent)]" aria-hidden="true" />At or above target</span>
                    <span className="inline-flex items-center gap-1.5">
                        <ExclamationTriangleIcon className="h-3.5 w-3.5 text-[#8A5300]" aria-hidden="true" />Below target
                    </span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-3 w-[2px] rounded-full bg-[var(--ink-500)]" aria-hidden="true" />{TARGET}% target</span>
                </span>
            </div>
            {!att
                ? <p className="text-[0.875rem] text-[var(--ink-500)]">Checking today&apos;s roll…</p>
                : classes.length === 0
                    ? <p className="text-[0.875rem] text-[var(--ink-500)]">No class has students on its roll yet.</p>
                    : <table className="w-full border-collapse">
                        <caption className="sr-only">
                            Attendance by class, present out of enrolled, against a {TARGET}% target. {below} below target.
                        </caption>
                        <thead className="sr-only">
                            <tr><th scope="col">Class</th><th scope="col">Share of the roll</th><th scope="col">Present</th><th scope="col">Present of enrolled</th></tr>
                        </thead>
                        <tbody>
                            {classes.map((c) => {
                                const share = c.total ? (c.present / c.total) * 100 : 0;
                                const low = c.present > 0 && share < TARGET;
                                return (
                                    <tr key={c.name} className="app-dash-class">
                                        <th scope="row" className="w-[6.5rem] py-[5px] pr-3 text-left text-[0.8125rem] font-normal text-[var(--ink-700)]">
                                            <span className="block max-w-[9rem] truncate" title={c.name}>{c.name}</span>
                                        </th>
                                        <td className="py-[5px] pr-3">
                                            <span className="relative block">
                                                <span className="block h-2.5 overflow-hidden rounded-full"
                                                    style={{ background: low ? "var(--viz-warning-track)" : "var(--viz-accent-track)" }} aria-hidden="true">
                                                    <span className="app-dash-bar block h-full rounded-full"
                                                        style={{ width: `${share}%`, background: low ? "var(--viz-warning)" : "var(--viz-accent)" }} />
                                                </span>
                                                {/* the target, one hairline at the same place on every row */}
                                                <span className="absolute top-[-3px] h-4 w-[2px] rounded-full bg-[var(--ink-500)]" style={{ left: `calc(${TARGET}% - 1px)` }} aria-hidden="true" />
                                            </span>
                                        </td>
                                        <td className="w-[4.5rem] py-[5px] text-right text-[0.8125rem] font-semibold tabular-nums text-[var(--ink-900)]">
                                            <span className="inline-flex items-center justify-end gap-1">
                                                {low && <>
                                                    <ExclamationTriangleIcon className="h-3.5 w-3.5 text-[#8A5300]" aria-hidden="true" />
                                                    <span className="sr-only">below target, </span>
                                                </>}
                                                {c.present ? `${share.toFixed(1)}%` : "–"}
                                            </span>
                                        </td>
                                        <td className="w-[4.75rem] py-[5px] pl-2 text-right text-[0.75rem] tabular-nums text-[var(--ink-500)]">{c.present}/{c.total}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>}
            {att?.staff &&
                <p className="mt-auto border-t border-[var(--line-soft)] pt-3 text-[0.8125rem] text-[var(--ink-600)]">
                    Staff: <span className="font-semibold text-[var(--ink-900)]">{att.staff.present}</span> of {att.staff.total} present
                    {att.staff.absent > 0 && <> · {att.staff.absent} not in</>}
                </p>}
        </section>
    );
}

/* ------------------------------------------------------- needs attention */

function useDevicesOnce(school) {
    const [devices, setDevices] = useState(null);
    useEffect(() => {
        if (!school) return;
        let live = true;
        (async () => {
            const rows = await fetchSchoolDevices(school);
            if (live) setDevices(Array.isArray(rows) ? rows : []);
        })();
        return () => { live = false; };
    }, [school]);
    return devices;
}

/**
 * What needs a person today, worst first. Built only from signals the
 * dashboard already reads: offline card readers, the SMS balance, the
 * working years, and today's roll. Nothing to do is said plainly.
 */
export function NeedsAttention({ school, att, smsInfo }) {
    const { fiscalYear: { year, setShowFiscalYearPicker } } = useAppContext();
    const devices = useDevicesOnce(school);
    const items = [];

    const offline = (devices || []).filter((d) => !d?.online);
    if (offline.length) {
        items.push({
            tone: "bad", Icon: CpuChipIcon,
            title: `${offline.length} attendance reader${offline.length === 1 ? " is" : "s are"} offline`,
            body: `${offline.map((d) => d?.name || d?.serial_number).filter(Boolean).join(", ")}. Students passing ${offline.length === 1 ? "it" : "them"} are not being marked.`,
            action: { label: "See devices", run: () => document.getElementById("dash-devices")?.scrollIntoView({ behavior: "smooth", block: "start" }) },
        });
    }
    if (year && !(year.economic_year && year.academic_year && year.accounting_economic_year)) {
        items.push({
            tone: "warn", Icon: CalendarDaysIcon,
            title: "A working year is not set",
            body: "Bills, attendance and reports need the economic, academic and accounting years chosen.",
            action: { label: "Choose years", run: () => setShowFiscalYearPicker(true) },
        });
    }
    const credit = Number(smsInfo?.estimated_credit ?? smsInfo?.available_credit);
    if (Number.isFinite(credit) && credit < SMS_LOW) {
        items.push({
            tone: "warn", Icon: ChatBubbleLeftRightIcon,
            title: "SMS credits are running low",
            body: `${credit.toLocaleString("en-IN")} credits left. Absence alerts and notices stop when they run out.`,
        });
    }
    const roster = att?.students?.total || 0;
    const present = att?.students?.present || 0;
    if (att && roster > 0 && present > 0 && present / roster < 0.85) {
        items.push({
            tone: "warn", Icon: AcademicCapIcon,
            title: `Attendance is low today: ${Math.round((present / roster) * 100)}%`,
            body: `${(roster - present).toLocaleString("en-IN")} students are not in. Classes below the 90% target are flagged in the list.`,
        });
    }
    if (att && roster > 0 && present === 0) {
        items.push({
            tone: "info", Icon: UserGroupIcon,
            title: "No student is marked present yet",
            body: "The roll fills as cards are punched or teachers take attendance.",
        });
    }
    const low = (att?.classes || []).filter((c) => c.total && c.present && c.present / c.total < 0.9);
    if (low.length && !(present / roster < 0.85)) {
        items.push({
            tone: "info", Icon: ReceiptPercentIcon,
            title: `${low.length} class${low.length === 1 ? " is" : "es are"} below 90% today`,
            body: low.slice(0, 4).map((c) => c.name).join(", ") + (low.length > 4 ? ` and ${low.length - 4} more` : "") + ".",
        });
    }

    const tones = {
        bad: "bg-[#FDECEA] text-[#B42318]",
        warn: "bg-[#FFF4E0] text-[#8A5300]",
        info: "bg-[var(--t-brand-tint)] text-[var(--t-brand-ink)]",
    };
    const ready = devices !== null && att;
    return (
        <section aria-labelledby="dash-attention" className="app-panel flex flex-1 flex-col rounded-xl bg-white px-5 pb-3 pt-5 sm:px-6">
            <div className="flex items-center justify-between gap-3 pb-2">
                <h2 id="dash-attention" className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Needs attention</h2>
                {ready && items.length > 0 &&
                    <span className="h-6 rounded-full bg-[var(--line-soft)] px-2 text-[0.75rem] font-semibold leading-6 tabular-nums text-[var(--ink-700)]">{items.length}</span>}
            </div>
            {!ready
                ? <p className="py-3 text-[0.875rem] text-[var(--ink-500)]">Checking…</p>
                : items.length === 0
                    ? <div className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center">
                        <CheckCircleIcon className="h-8 w-8 text-[#12723F]" aria-hidden="true" />
                        <p className="text-[0.9375rem] font-semibold text-[var(--ink-900)]">All clear</p>
                        <p className="max-w-[16rem] text-[0.8125rem] leading-5 text-[var(--ink-600)]">Readers are online, the years are set and today&apos;s roll looks normal.</p>
                    </div>
                    : <ul className="flex flex-col">
                        {items.map((it, i) => (
                            <li key={i} className="app-dash-attention flex gap-3 border-t border-[var(--line-soft)] py-3.5">
                                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[it.tone]}`}>
                                    {it.tone === "bad"
                                        ? <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                                        : <it.Icon className="h-4 w-4" aria-hidden="true" />}
                                </span>
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                                    <p className="text-[0.875rem] font-semibold leading-5 text-[var(--ink-900)]">{it.title}</p>
                                    <p className="text-[0.8125rem] leading-5 text-[var(--ink-600)]">{it.body}</p>
                                    {it.action &&
                                        <button type="button" onClick={it.action.run}
                                            className="mt-1 self-start text-[0.8125rem] font-semibold normal-case text-[var(--t-brand-ink)] underline-offset-2 hover:underline">
                                            {it.action.label}
                                        </button>}
                                </div>
                            </li>
                        ))}
                    </ul>}
        </section>
    );
}
