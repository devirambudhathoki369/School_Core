/**
 * One person's attendance for a year, turned into what the profile's
 * Attendance tab draws: a figure for the year, one for each month, a calendar
 * of days and the list of days absent.
 *
 * The server sends the bare record (`/api/attendance/history`): the calendar of
 * the year (`months`: length and first weekday of each) and one entry per day
 * attendance was marked (`days`). Everything counted here is counted from those
 * entries and nothing else, so the year, the months and the list always agree.
 *
 * A day is one of:
 *   present   marked present (with the arrival / leaving time, if a card was used,
 *             and the note written beside the mark, such as "late")
 *   reasoned  marked absent, and a reason was written down
 *   absent    marked absent with no reason
 *   saturday  not marked, and a Saturday
 *   ahead     not marked, and later than today
 *   unmarked  not marked on a day that has passed: a holiday, or nobody took it
 */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n) => String(n).padStart(2, '0');

/** The middle value: what a usual day looks like, unmoved by one odd punch. */
export function median(values) {
    const list = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    if (!list.length) return null;
    const mid = Math.floor(list.length / 2);
    return list.length % 2 ? list[mid] : Math.round((list[mid - 1] + list[mid]) / 2);
}

/**
 * Whole percentages that add up to exactly 100 (largest remainder), so the
 * figures beside a pie never total 99 or 101.
 */
export function shares(counts) {
    const total = counts.reduce((sum, n) => sum + n, 0);
    if (!total) return counts.map(() => 0);
    const exact = counts.map((n) => (n / total) * 100);
    const whole = exact.map(Math.floor);
    let left = 100 - whole.reduce((sum, n) => sum + n, 0);
    exact
        .map((value, i) => ({ i, rest: value - whole[i] }))
        .sort((a, b) => b.rest - a.rest || a.i - b.i)
        .forEach(({ i }) => { if (left > 0) { whole[i] += 1; left -= 1; } });
    return whole;
}

/**
 * A share as it is printed. A part that exists is never called 0%, and a year
 * with a single absence is never called 100% present.
 */
export function shareLabel(count, share, total) {
    if (!total) return '';
    if (count > 0 && share === 0) return '<1%';
    if (count < total && share === 100) return '99%';
    return `${share}%`;
}

/** Minutes after midnight as a clock time: 581 -> "9:41", or "9:41 am". */
export function clock(minutes, meridiem = false) {
    if (!Number.isFinite(minutes)) return '';
    const hour = Math.floor(minutes / 60) % 24;
    const text = `${hour % 12 || 12}:${pad(minutes % 60)}`;
    return meridiem ? `${text} ${hour < 12 ? 'am' : 'pm'}` : text;
}

/** A length of time: 438 -> "7 h 18 min". */
export function duration(minutes) {
    if (!Number.isFinite(minutes) || minutes < 0) return '';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (!hours) return `${rest} min`;
    return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function tally(cells) {
    const count = { marked: 0, present: 0, reasoned: 0, unexplained: 0 };
    for (const cell of cells) {
        if (cell.state === 'present') count.present += 1;
        else if (cell.state === 'reasoned') count.reasoned += 1;
        else if (cell.state === 'absent') count.unexplained += 1;
        else continue;
        count.marked += 1;
    }
    return { ...count, absent: count.reasoned + count.unexplained };
}

export default function summarise(payload) {
    const year = String(payload?.year || '');
    const today = String(payload?.today || '');
    const table = Array.isArray(payload?.months) ? payload.months : [];
    const days = Array.isArray(payload?.days) ? payload.days : [];

    const byDate = new Map(days.map((day) => [day.date, day]));
    // BS dates are zero-padded YYYY-MM-DD, so plain text order is date order.
    const isAhead = (date) => Boolean(today) && date > today;

    const months = table.map((m) => {
        const cells = [];
        for (let n = 1; n <= m.days; n++) {
            const date = `${year}-${pad(m.month)}-${pad(n)}`;
            const weekday = (m.starts + n - 1) % 7;
            const record = byDate.get(date);
            let state = 'unmarked';
            if (record) state = record.present ? 'present' : (record.reason ? 'reasoned' : 'absent');
            else if (weekday === 6) state = 'saturday';
            else if (isAhead(date)) state = 'ahead';
            cells.push({
                n, date, weekday, state, month: m.month,
                in: record?.present ? record.in ?? null : null,
                out: record?.present ? record.out ?? null : null,
                reason: record && !record.present ? record.reason || '' : '',
                note: record?.present ? record.reason || '' : '',
                today: date === today,
            });
        }
        return {
            month: m.month,
            starts: m.starts,
            cells,
            ...tally(cells),
            // a month whose first day is still to come
            started: !isAhead(`${year}-${pad(m.month)}-01`),
        };
    });

    const all = months.flatMap((m) => m.cells);
    const total = tally(all);
    const present = all.filter((cell) => cell.state === 'present');
    const absences = all
        .filter((cell) => cell.state === 'reasoned' || cell.state === 'absent')
        .sort((a, b) => (a.date < b.date ? 1 : -1));
    const punched = present.filter((cell) => cell.in !== null);
    // A leaving time is only "usual" when most days have one. A student whose
    // card was read on the way out a few times in a year has no usual leaving
    // time, and the middle of those few days would be passed off as one.
    const paired = punched.filter((cell) => cell.out !== null && cell.out > cell.in);
    const leaves = paired.length >= 3 && paired.length * 2 >= punched.length;
    const marked = all.filter((cell) => cell.state === 'present' || cell.state === 'reasoned' || cell.state === 'absent');

    return {
        year,
        today,
        months,
        ...total,
        shares: shares([total.present, total.reasoned, total.unexplained]),
        absences,
        first: marked[0] || null,
        last: marked[marked.length - 1] || null,
        usual: {
            in: median(punched.map((cell) => cell.in)),
            out: leaves ? median(paired.map((cell) => cell.out)) : null,
            stay: leaves ? median(paired.map((cell) => cell.out - cell.in)) : null,
            punches: punched.length,
        },
    };
}

/**
 * The month the calendar opens on: the running month while its year is the
 * one shown, otherwise the last month that holds a record.
 */
export function openingMonth(summary) {
    const months = summary?.months || [];
    if (!months.length) return 1;
    if (summary.today.slice(0, 4) === summary.year) {
        const running = Number(summary.today.slice(5, 7));
        if (months.some((m) => m.month === running)) return running;
    }
    const held = months.filter((m) => m.marked > 0);
    return held.length ? held[held.length - 1].month : months[0].month;
}
