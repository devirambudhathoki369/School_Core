import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowPathIcon, CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import Loader from "@/components/Loader";
import EmptyState from "@/components/EmptyState";
import { useAppContext } from "@/contexts/AppContext";
import { months as MONTH_NAMES } from "@/components/inputs/options/months";
import { fetchAttendanceHistory } from "@/services/functions/attendanceHistory";
import summarise, { WEEKDAYS, clock, duration, openingMonth, shareLabel } from "@/methods/attendanceHistory";

// The year's record is long; the list opens on the newest of it.
const ROWS_SHOWN = 8;


function monthName(month) {
    const name = MONTH_NAMES[month] || "";
    return name.charAt(0).toUpperCase() + name.slice(1);
}

function slices(count) {
    return [
        { tone: "present", value: count.present },
        { tone: "reasoned", value: count.reasoned },
        { tone: "absent", value: count.unexplained },
    ];
}

/**
 * The days marked, split into present, absent with a reason and absent without
 * one: a segmented bar, never a pie (two close slices of a pie are guessed at;
 * blocks laid along one line are read). `parts` come in the order they are
 * drawn; a part of zero draws nothing; a 2px gap of the card shows between two.
 *
 *   tall   the year: 28px blocks, each one's share printed inside where it fits
 *   thin   a month: 8px with rounded ends, no text — its figures sit beside it
 *
 * With nothing to draw it is an empty track: dashed for a month still to come,
 * plain for one with no record.
 */
function SplitBar({ parts, label, tall = false, dashed = false, shares }) {
    const total = parts.reduce((sum, part) => sum + part.value, 0);
    if (!total) {
        return <span className={`app-att-split is-empty ${tall ? "is-tall" : "is-thin"}`} data-dashed={dashed ? "true" : undefined} aria-hidden="true" />;
    }
    const shown = parts.filter((part) => part.value > 0);
    return (
        <span className={`app-att-split ${tall ? "is-tall" : "is-thin"}`} role="img" aria-label={label}>
            {shown.map((part) => {
                const share = (part.value / total) * 100;
                // the legend's own figure when it is given, so the block and
                // the list beside it can never disagree by a rounding
                const printed = shares?.[part.tone] ?? `${Math.round(share)}%`;
                return (
                    <span key={part.tone} className={`is-${part.tone}`} style={{ flex: `${part.value} 1 0` }}>
                        {/* a block too narrow for its share prints none: the legend has it */}
                        {tall && share >= 12 && <b>{printed}</b>}
                    </span>
                );
            })}
        </span>
    );
}

/**
 * What a day's square says under its number. Only a day that was marked says
 * anything: in a month where the roll was taken on three days, twenty-six
 * squares reading "Not marked" buried the three that mattered.
 */
function dayNote(cell) {
    if (cell.state === "present") {
        if (cell.in === null) return "Present";
        return cell.out === null ? clock(cell.in) : `${clock(cell.in)}–${clock(cell.out)}`;
    }
    if (cell.state === "reasoned") return cell.reason;
    if (cell.state === "absent") return "Absent";
    return cell.today ? "Today" : "";
}

/** The same square in words, for its tooltip. */
function dayTitle(cell) {
    if (cell.state === "saturday") return "Saturday, not marked";
    if (cell.state === "unmarked") return "Not marked";
    return cell.today ? "Today" : "";
}

/** The same day in a full sentence, for the strip under the calendar. */
function dayDetail(cell) {
    if (cell.state === "reasoned") return `Absent, ${cell.reason}`;
    if (cell.state === "absent") return "Absent, no reason given";
    const parts = ["Present"];
    if (cell.in !== null) parts.push(`in ${clock(cell.in, true)}`);
    if (cell.out !== null) parts.push(`out ${clock(cell.out, true)}`);
    if (cell.in !== null && cell.out !== null && cell.out > cell.in) parts.push(duration(cell.out - cell.in));
    return parts.join(", ") + (cell.note ? ` (${cell.note})` : "");
}

const isMarked = (cell) => cell.state === "present" || cell.state === "reasoned" || cell.state === "absent";

/**
 * The Attendance tab of a profile: one student's or one staff member's year.
 *
 * `kind` is "student" or "staff"; `personId` is theirs. Everything on the tab
 * is counted from the days attendance was actually marked, so a holiday or a
 * day nobody took the roll is neither present nor absent.
 */
export default function ProfileAttendance({ kind, personId }) {
    const { user: { user } } = useAppContext();
    const school = user?.profile?.school || user?.profile?.id;

    const [status, setStatus] = useState("loading");   // loading | ready | failed
    const [message, setMessage] = useState("");
    const [payload, setPayload] = useState(null);
    const [month, setMonth] = useState(null);
    const [picked, setPicked] = useState(null);         // the date of the day in the strip
    const [showAll, setShowAll] = useState(false);
    // Only the newest request may answer: a slow first year must not land on
    // top of the year picked after it, nor on another person's profile.
    const asked = useRef(0);

    const load = useCallback(async (year) => {
        if (!school || !personId) return;
        const ticket = ++asked.current;
        setStatus("loading");
        const [ok, data, why] = await fetchAttendanceHistory({ school, [kind]: personId, year });
        if (ticket !== asked.current) return;
        if (!ok) {
            setMessage(why);
            setStatus("failed");
            return;
        }
        setPayload(data);
        setMonth(null);
        setPicked(null);
        setShowAll(false);
        setStatus("ready");
    }, [school, kind, personId]);

    useEffect(() => {
        load();
        return () => { asked.current += 1; };
    }, [load]);

    const summary = useMemo(() => (payload ? summarise(payload) : null), [payload]);

    if (status === "failed") {
        return (
            <EmptyState icon={CalendarDaysIcon} tone="warn" title="The attendance could not be loaded" hint={message}
                action={(
                    <button type="button" onClick={() => load(payload?.year)}
                        className="app-retry-btn inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition">
                        <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                        Try again
                    </button>
                )} />
        );
    }
    if (!summary) return <Loader variant="cards" label="Loading attendance" />;

    const years = payload.years || [];
    if (!years.length || !summary.months.length) {
        return (
            <EmptyState icon={CalendarDaysIcon} title="No attendance marked yet"
                hint={`The days will appear here once attendance is taken for this ${kind === "staff" ? "staff member" : "student"}.`} />
        );
    }

    const shown = summary.months.find((m) => m.month === (month ?? openingMonth(summary))) || summary.months[0];
    const parts = slices(summary);
    const [presentShare, reasonedShare, unexplainedShare] = summary.shares;
    const splitByReason = summary.reasoned > 0;
    const lastAbsent = summary.absences[0];
    // The strip opens on the newest absence of the month shown: it is the day
    // someone opens this tab to ask about, and on a phone the squares are too
    // small to carry its reason.
    const pickedCell = (picked && shown?.cells.find((cell) => cell.date === picked && isMarked(cell)))
        || [...(shown?.cells || [])].reverse().find((cell) => cell.state === "reasoned" || cell.state === "absent")
        || null;
    const rows = showAll ? summary.absences : summary.absences.slice(0, ROWS_SHOWN);

    function openDay(cell) {
        setMonth(cell.month);
        setPicked(cell.date);
    }
    // The months either side of the one shown, for the arrows on the calendar:
    // by the time its days are on screen the row of months has scrolled away.
    const canOpen = (m) => Boolean(m) && (m.started || m.marked > 0);
    const at = summary.months.indexOf(shown);
    const before = summary.months[at - 1];
    const after = summary.months[at + 1];
    function stepTo(m) {
        setMonth(m.month);
        setPicked(null);
    }

    return (
        <div className="app-att" aria-busy={status === "loading"}>
            <div className="app-att-head">
                <div>
                    <h2 className="app-att-title">Attendance</h2>
                    <p className="app-att-caption">
                        {summary.marked
                            ? `Year ${summary.year}, ${monthName(summary.first.month)} ${summary.first.n}${summary.marked > 1 ? ` to ${monthName(summary.last.month)} ${summary.last.n}` : ""}. Attendance was marked on ${summary.marked} ${summary.marked === 1 ? "day" : "days"}.`
                            : `Nothing has been marked in ${summary.year} yet.`}
                    </p>
                </div>
                {years.length > 1 && (
                    <label className="app-att-yearpick">
                        <span>Year</span>
                        <select value={summary.year} disabled={status === "loading"}
                            onChange={(e) => load(e.target.value)}>
                            {years.map((year) => <option key={year} value={year}>{year}</option>)}
                        </select>
                    </label>
                )}
            </div>

            <div className="app-att-top">
                <div className="app-att-year">
                    <div className="app-att-eyebrow">The year so far</div>
                    <div className="app-att-figure">
                        <SplitBar tall parts={parts}
                            shares={{
                                present: shareLabel(summary.present, presentShare, summary.marked),
                                reasoned: shareLabel(summary.reasoned, reasonedShare, summary.marked),
                                absent: shareLabel(summary.unexplained, unexplainedShare, summary.marked),
                            }}
                            label={`Days marked: present ${summary.present}, absent with a reason ${summary.reasoned || 0}, absent without one ${summary.unexplained || 0}`} />
                        <div className="app-att-headline">
                            <div>
                                <span className="app-att-pct">{shareLabel(summary.present, presentShare, summary.marked) || "0%"}</span>
                                <span className="app-att-pct-word">present</span>
                            </div>
                            <div className="app-att-sub">
                                {summary.present} of the {summary.marked} {summary.marked === 1 ? "day" : "days"} marked
                            </div>
                        </div>
                        <ul className="app-att-legend">
                            <li>
                                <i className="app-att-swatch" data-tone="present" aria-hidden="true" />
                                <b>Present</b>
                                <span>{summary.present} {summary.present === 1 ? "day" : "days"}</span>
                                <em>{shareLabel(summary.present, presentShare, summary.marked)}</em>
                            </li>
                            {splitByReason && (
                                <li>
                                    <i className="app-att-swatch" data-tone="reasoned" aria-hidden="true" />
                                    <b>Absent, reason given</b>
                                    <span>{summary.reasoned} {summary.reasoned === 1 ? "day" : "days"}</span>
                                    <em>{shareLabel(summary.reasoned, reasonedShare, summary.marked)}</em>
                                </li>
                            )}
                            <li>
                                <i className="app-att-swatch" data-tone="absent" aria-hidden="true" />
                                <b>{splitByReason ? "Absent, no reason" : "Absent"}</b>
                                <span>{summary.unexplained} {summary.unexplained === 1 ? "day" : "days"}</span>
                                <em>{shareLabel(summary.unexplained, unexplainedShare, summary.marked)}</em>
                            </li>
                        </ul>
                    </div>
                    <dl className="app-att-facts">
                        <dt>Last absent</dt>
                        <dd>{lastAbsent
                            ? `${monthName(lastAbsent.month)} ${lastAbsent.n}, ${WEEKDAYS[lastAbsent.weekday]}`
                            : "No day absent"}</dd>
                        {summary.usual.in !== null && (<>
                            <dt>Usual arrival</dt>
                            <dd>{clock(summary.usual.in, true)} <span>from {summary.usual.punches} card {summary.usual.punches === 1 ? "punch" : "punches"}</span></dd>
                        </>)}
                        {summary.usual.out !== null && (<>
                            <dt>Usual leaving</dt>
                            <dd>{clock(summary.usual.out, true)}</dd>
                        </>)}
                        {summary.usual.stay !== null && (<>
                            <dt>Time at school</dt>
                            <dd>{duration(summary.usual.stay)} <span>on a usual day</span></dd>
                        </>)}
                    </dl>
                </div>

                <div className="app-att-months">
                    <div className="app-att-monthhead">
                        <div className="app-att-eyebrow">Month by month</div>
                        <div className="app-att-hint">Pick a month to see its days below</div>
                    </div>
                    <div className="app-att-monthgrid">
                        {summary.months.map((m) => {
                            const name = monthName(m.month);
                            const selected = m.month === shown?.month;
                            return (
                                <button key={m.month} type="button" className="app-att-month"
                                    data-selected={selected ? "true" : undefined} aria-pressed={selected}
                                    disabled={!m.started && !m.marked}
                                    onClick={() => { setMonth(m.month); setPicked(null); }}>
                                    <SplitBar parts={slices(m)} dashed={!m.started}
                                        label={`${name}: present ${m.present} of ${m.marked} days`} />
                                    <span className="app-att-month-name">{name}</span>
                                    <span className="app-att-month-count">
                                        {m.marked ? `${m.present} of ${m.marked}` : (m.started ? "No record" : "Not yet")}
                                    </span>
                                    <span className="app-att-month-note" data-tone={m.absent ? undefined : "good"}>
                                        {m.marked ? (m.absent ? `${m.absent} absent` : "Every day") : " "}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="app-att-bottom">
                <div className="app-att-cal">
                    <div className="app-att-calhead">
                        <div className="app-att-caltitle">
                            <div>
                                <h3 className="app-att-h3" aria-live="polite">{monthName(shown.month)} {summary.year}</h3>
                                <div className="app-att-caption">
                                    {shown.marked
                                        ? `Present ${shown.present} ${shown.present === 1 ? "day" : "days"}, absent ${shown.absent}, marked ${shown.marked}`
                                        : "Nothing marked in this month"}
                                </div>
                            </div>
                            {/* The two arrows stand together and after the name,
                                so neither moves as the line beside them changes
                                length from one month to the next. */}
                            <div className="app-att-steps">
                                <button type="button" className="app-att-step" disabled={!canOpen(before)}
                                    aria-label="Previous month" title="Previous month"
                                    onClick={() => stepTo(before)}>
                                    <ChevronLeftIcon aria-hidden="true" />
                                </button>
                                <button type="button" className="app-att-step" disabled={!canOpen(after)}
                                    aria-label="Next month" title="Next month"
                                    onClick={() => stepTo(after)}>
                                    <ChevronRightIcon aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                        <div className="app-att-key">
                            <span><i data-state="present" aria-hidden="true" />Present</span>
                            <span><i data-state="absent" aria-hidden="true" />Absent</span>
                            <span><i data-state="saturday" aria-hidden="true" />Saturday</span>
                            <span><i data-state="unmarked" aria-hidden="true" />Not marked</span>
                            {shown.cells.some((cell) => cell.note) && (
                                <span><i data-state="note" aria-hidden="true" />Has a note</span>
                            )}
                        </div>
                    </div>
                    <div className="app-att-weekdays" aria-hidden="true">
                        {WEEKDAYS.map((day) => <div key={day}>{day.slice(0, 3)}</div>)}
                    </div>
                    <div className="app-att-grid">
                        {Array.from({ length: shown.starts }).map((_, i) => (
                            <div key={`blank-${i}`} className="app-att-day" data-state="blank" />
                        ))}
                        {shown.cells.map((cell) => {
                            const note = dayNote(cell);
                            const label = `${monthName(cell.month)} ${cell.n}, ${WEEKDAYS[cell.weekday]}`;
                            if (!isMarked(cell)) {
                                return (
                                    <div key={cell.date} className="app-att-day" data-state={cell.state}
                                        data-today={cell.today ? "true" : undefined}
                                        title={dayTitle(cell) ? `${label}: ${dayTitle(cell)}` : label}>
                                        <b>{cell.n}</b>
                                        <span>{note}</span>
                                    </div>
                                );
                            }
                            const on = pickedCell?.date === cell.date;
                            return (
                                <button key={cell.date} type="button" className="app-att-day" data-state={cell.state}
                                    data-today={cell.today ? "true" : undefined}
                                    data-note={cell.note ? "true" : undefined}
                                    data-picked={on ? "true" : undefined} aria-pressed={on}
                                    aria-label={`${label}: ${dayDetail(cell)}`} title={`${label}: ${dayDetail(cell)}`}
                                    onClick={() => setPicked(cell.date)}>
                                    <b>{cell.n}</b>
                                    <span>{note}</span>
                                </button>
                            );
                        })}
                    </div>
                    {pickedCell && (
                        <div className="app-att-detail" data-state={pickedCell.state} role="status">
                            <b>{monthName(pickedCell.month)} {pickedCell.n}, {WEEKDAYS[pickedCell.weekday]}</b>
                            <span>{dayDetail(pickedCell)}</span>
                        </div>
                    )}
                </div>

                <div className="app-att-list">
                    <h3 className="app-att-h3">Days absent this year</h3>
                    <div className="app-att-caption">
                        {summary.absent
                            ? `${summary.absent} ${summary.absent === 1 ? "day" : "days"}, newest first`
                            : "Not absent on any day that was marked"}
                    </div>
                    {summary.absent > 0 && (
                        <ul className="app-att-rows">
                            {rows.map((cell) => (
                                <li key={cell.date}>
                                    <button type="button" className="app-att-row" onClick={() => openDay(cell)}
                                        title="Show this day in the calendar">
                                        <span>
                                            <b>{monthName(cell.month)} {cell.n}</b>
                                            <i>{WEEKDAYS[cell.weekday]}</i>
                                        </span>
                                        <span className="app-att-chip" data-tone={cell.state}>
                                            {cell.reason || "No reason given"}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {summary.absences.length > ROWS_SHOWN && (
                        <button type="button" className="app-att-more" onClick={() => setShowAll((all) => !all)}>
                            {showAll ? "Show fewer" : `Show all ${summary.absences.length}`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
