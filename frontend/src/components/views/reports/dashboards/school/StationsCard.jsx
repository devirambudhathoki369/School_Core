// How many stations to name before the rest are summed up in one line.
const SHOWN = 8;

/**
 * Students by bus station, busiest first.
 *
 * Stations are names, not a sequence — there is no "between" Majuwa and
 * Ranagaun. This was a line drawn through them in whatever order they came,
 * with the names tilted to fit; a ranked list of bars reads the same thing at a
 * glance and has room for the names upright and the counts in figures.
 *
 *   stations  ["Majuwa", …]   names as the school typed them
 *   counts    [56, …]         the same length
 */
function StationsCard({ stations, counts }) {
    const rows = (stations || [])
        .map((name, i) => ({ name: `${name ?? ""}`.trim() || "Unnamed station", count: Number(counts?.[i]) || 0 }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count);
    const total = rows.reduce((n, row) => n + row.count, 0);
    const top = rows.slice(0, SHOWN);
    const rest = rows.slice(SHOWN);
    const most = top[0]?.count || 1;

    return (
        <div className="app-panel flex h-full flex-col rounded-xl border bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">Students by bus station</h3>
                {total > 0 &&
                    <span className="shrink-0 text-xs font-semibold text-[var(--ink-500)]">
                        {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                        <b className="text-sm font-bold tabular-nums text-[var(--ink-900)]">{total}</b> students · <b className="text-sm font-bold tabular-nums text-[var(--ink-900)]">{rows.length}</b> station{rows.length === 1 ? "" : "s"}
                    </span>}
            </div>
            {total === 0 ? (
                <p className="mt-2 text-[13px] leading-snug text-[var(--ink-500)]">No students are enrolled on a bus route yet.</p>
            ) : (
                <>
                    <ol className="mt-3.5 flex flex-1 flex-col justify-between gap-y-2.5">
                        {top.map((row, i) => (
                            <li key={`${row.name}-${i}`} className="app-dash-class grid grid-cols-[minmax(0,34%)_minmax(0,1fr)_2.25rem] items-center gap-x-3 rounded-md px-1 py-[3px]">
                                {/* the name as the school entered it */}
                                <span className="truncate text-[13px] font-medium text-[var(--ink-700)]" title={row.name}>{row.name}</span>
                                {/* one series, so one colour: the accent. Ranked bars from a
                                    single baseline — square there, a 4px rounded data-end —
                                    with the count at the tip. */}
                                <span className="h-2.5" aria-hidden="true">
                                    <span className="app-dash-bar block h-full rounded-r-[4px]" style={{ width: `${Math.max(3, (row.count / most) * 100)}%`, background: "var(--viz-accent)" }}></span>
                                </span>
                                <span className="text-right text-[13px] font-bold tabular-nums text-[var(--ink-900)]">{row.count}</span>
                            </li>
                        ))}
                    </ol>
                    {rest.length > 0 &&
                        <p className="mt-3 border-t border-[var(--line-soft)] pt-2.5 text-xs font-medium text-[var(--ink-500)]">
                            + {rest.length} more station{rest.length === 1 ? "" : "s"} with {rest.reduce((n, row) => n + row.count, 0)} students
                        </p>}
                </>
            )}
        </div>
    );
}

export default StationsCard;
