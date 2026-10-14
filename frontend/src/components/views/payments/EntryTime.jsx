/**
 * When a line of a statement was entered, under its date.
 *
 * The date on a line is the date the bill or posting CARRIES, which the school
 * may have set back; the time is of the moment it was really saved. So the time
 * stands alone only when the two fall on the same day. A back-dated line says
 * the day as well, because "2083-03-04 09:46" would be a moment nothing
 * happened at.
 */

// On every element, not just the outer one, and with `!`: the statements size
// each descendant from one rule (`.children-text-base *`), which reaches the
// inner span directly and which a plain size class does not outrank.
const SMALL = "!text-[0.75rem] !font-normal leading-tight text-gray-800";

export default function EntryTime({ row }) {
    if (!row?.entered_time) return null;
    const sameDay = !row?.entered_on || row.entered_on === row?.date;
    // The clock time is never split across lines ("09:45:00" over "AM"); in a
    // narrow column it is the words before it that wrap. On paper the columns
    // are narrower still, and there it may break rather than run into the next
    // column.
    const time = (
        <span className={`${SMALL} whitespace-nowrap print:whitespace-normal`}>{row.entered_time}</span>
    );
    return (
        <span className={`block ${SMALL}`}>
            {sameDay ? time : <>entered {row.entered_on} {time}</>}
        </span>
    );
}
