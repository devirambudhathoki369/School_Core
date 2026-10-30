import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip } from "chart.js";
import { months } from "@/components/inputs/options/months";

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

const rupees = (n) => `Rs ${Math.round(Number(n) || 0).toLocaleString("en-IN")}`;
// an axis has no room for 8,65,470: 8.7 L, 65K, 1.2 Cr
function compact(n) {
    const short = (value, unit) => `${Number(value.toFixed(value < 10 ? 1 : 0))}${unit}`;
    if (n >= 1e7) return short(n / 1e7, " Cr");
    if (n >= 1e5) return short(n / 1e5, " L");
    if (n >= 1e3) return short(n / 1e3, "K");
    return `${n}`;
}
const monthName = (m) => { const name = months[parseInt(m, 10)] || `${m}`; return name.charAt(0).toUpperCase() + name.slice(1); };

// A theme colour as the canvas needs it ("rgb(13, 148, 136)"). A school's theme
// arrives with its profile, a moment after the first paint, so it is re-read
// whenever the theme attribute changes.
function useThemeColour(variable, fallback) {
    const [colour, setColour] = useState(fallback);
    useEffect(() => {
        const read = () => {
            const probe = document.createElement("span");
            probe.style.color = `var(${variable}, ${fallback})`;
            document.body.appendChild(probe);
            const resolved = getComputedStyle(probe).color;
            probe.remove();
            setColour(resolved || fallback);
        };
        read();
        const watch = new MutationObserver(read);
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-theme", "data-ui-mode"] });
        return () => watch.disconnect();
    }, [variable, fallback]);
    return colour;
}
// The months behind the current one, de-emphasised: one grey, the same on
// every theme, so the colour on the chart is only ever "this month". Read from
// --viz-deemph (and the chrome from --viz-*), so dark mode has its own steps.

function Figure({ label, value, strong = false }) {
    return (
        <div className="min-w-0">
            {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
            <div className="truncate text-xs font-medium text-[var(--ink-600)]">{label}</div>
            {/* proportional figures: a standalone value, not a column */}
            <div className={`truncate font-semibold leading-tight text-[var(--ink-900)] ${strong ? "text-[1.65rem]" : "text-[1.05rem]"}`}>{value}</div>
        </div>
    );
}

/**
 * What the school has collected this economic year, month by month.
 *
 * Twelve separate totals are twelve columns. The line this replaces drew a
 * smooth curve through them, which showed dips and rises BETWEEN months that
 * never happened, and it had no total anywhere. The month in progress is the
 * accent — the one mark in colour — and the months behind it are grey. Every
 * value is reachable without hovering: the table view lists them all.
 *
 *   monthsList  [4, 5, 6]            BS month numbers, as the server sends them
 *   amounts     [35950, 326100, …]   the same length
 *   yearName    "EY2083/084"
 *   today       "2083-06-18"         the BS date, to know the month in progress
 */
function CollectionsCard({ monthsList, amounts, yearName, today }) {
    const colour = useThemeColour("--t-brand-solid", "rgb(59, 91, 219)");
    const [asTable, setAsTable] = useState(false);
    const DEEMPH = useThemeColour("--viz-deemph", "rgb(195, 201, 210)");
    const axis = useThemeColour("--viz-axis", "rgb(205, 210, 218)");
    const tick = useThemeColour("--viz-text", "rgb(100, 107, 120)");
    const grid = useThemeColour("--viz-grid", "rgb(238, 240, 244)");
    const rows = useMemo(() => (monthsList || []).map((m, i) => ({ month: parseInt(m, 10), amount: Number(amounts?.[i]) || 0 })), [monthsList, amounts]);
    const total = rows.reduce((n, r) => n + r.amount, 0);
    const current = parseInt(`${today || ""}`.split("-")[1], 10) || null;
    const thisMonth = rows.find((r) => r.month === current);
    const best = rows.reduce((top, r) => (r.amount > (top?.amount || 0) ? r : top), null);
    const marksCurrent = rows.some((r) => r.month === current);

    return (
        <div className="app-panel flex h-full flex-col rounded-xl border bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                <h3 className="text-[1rem] font-semibold leading-6 text-[var(--ink-900)]">
                    Fee collections{yearName && <span className="ml-2 text-[0.8125rem] font-normal text-[var(--ink-600)]">{yearName}</span>}
                </h3>
                {total > 0 &&
                    <div role="group" aria-label="Show as" className="flex rounded-[10px] border border-[var(--line)] bg-[var(--surface-soft)] p-0.5">
                        {[["Chart", false], ["Table", true]].map(([label, value]) => (
                            <button key={label} type="button" aria-pressed={asTable === value} onClick={() => setAsTable(value)}
                                className={`h-7 rounded-lg px-2.5 text-[0.75rem] font-semibold normal-case ${asTable === value
                                    ? "bg-white text-[var(--ink-900)] shadow-[0_1px_2px_rgb(17_24_39/.08)]"
                                    : "text-[var(--ink-600)]"}`}>{label}</button>
                        ))}
                    </div>}
            </div>

            {total <= 0 ? (
                <p className="mt-2 text-[13px] leading-snug text-[var(--ink-500)]">No payments have been collected in this economic year yet.</p>
            ) : (
                <>
                    <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-2">
                        <Figure label="Collected this year" value={rupees(total)} strong />
                        {/* the rule divides them only while they share a line with the total */}
                        <div className="flex gap-x-6 sm:border-l sm:border-[var(--line)] sm:pl-6">
                            <Figure label={`This month · ${current ? monthName(current) : "—"}`} value={thisMonth ? rupees(thisMonth.amount) : "Rs 0"} />
                            {best && rows.length > 1 && <Figure label={`Best month · ${monthName(best.month)}`} value={rupees(best.amount)} />}
                        </div>
                    </div>
                    {marksCurrent && !asTable &&
                        <div className="mt-3 flex items-center gap-4 text-[0.75rem] text-[var(--ink-600)]">
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colour }} aria-hidden="true" />This month</span>
                            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: DEEMPH }} aria-hidden="true" />Earlier months</span>
                        </div>}
                    {asTable ? (
                        <table className="mt-3 w-full border-collapse text-[0.8125rem]">
                            <caption className="sr-only">Fee collections by month, {yearName}</caption>
                            <thead>
                                <tr className="border-b border-[var(--line)] text-left text-[0.75rem] text-[var(--ink-600)]">
                                    <th scope="col" className="py-2 font-semibold">Month</th>
                                    <th scope="col" className="py-2 text-right font-semibold">Collected</th>
                                    <th scope="col" className="py-2 text-right font-semibold">Share of the year</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.month} className="border-b border-[var(--line-soft)] last:border-0">
                                        <th scope="row" className="py-2 text-left font-normal text-[var(--ink-800)]">
                                            {monthName(r.month)}{r.month === current && <span className="ml-1.5 text-[0.75rem] text-[var(--ink-500)]">this month</span>}
                                        </th>
                                        <td className="py-2 text-right font-semibold tabular-nums text-[var(--ink-900)]">{rupees(r.amount)}</td>
                                        <td className="py-2 text-right tabular-nums text-[var(--ink-600)]">{total ? `${((r.amount / total) * 100).toFixed(1)}%` : "–"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                    <div className="mt-3 h-[11.5rem] min-h-0 flex-1" role="img"
                        aria-label={`Collections by month: ${rows.map((r) => `${monthName(r.month)} ${rupees(r.amount)}`).join(", ")}`}>
                        <Bar
                            data={{
                                labels: rows.map((r) => monthName(r.month)),
                                datasets: [{
                                    data: rows.map((r) => r.amount),
                                    // emphasis: this month in the accent, the rest grey; a
                                    // year with no current month is one plain series
                                    backgroundColor: rows.map((r) => (!marksCurrent || r.month === current ? colour : DEEMPH)),
                                    hoverBackgroundColor: rows.map((r) => (!marksCurrent || r.month === current ? colour : DEEMPH)),
                                    // a 4px rounded data-end, square on the baseline
                                    borderRadius: { topLeft: 4, topRight: 4 },
                                    borderSkipped: "bottom",
                                    // thin marks: never wider than 24px, the rest of the band is air
                                    maxBarThickness: 24,
                                    categoryPercentage: 0.72,
                                    barPercentage: 0.62,
                                }],
                            }}
                            options={{
                                maintainAspectRatio: false,
                                animation: { duration: 350 },
                                plugins: {
                                    legend: { display: false },
                                    tooltip: {
                                        displayColors: false,
                                        backgroundColor: "#0f172a",
                                        padding: 10,
                                        cornerRadius: 8,
                                        titleFont: { weight: "600", size: 12 },
                                        bodyFont: { weight: "700", size: 13 },
                                        callbacks: { label: (item) => rupees(item.parsed.y) },
                                    },
                                },
                                // recessive chrome: solid hairlines one step off the
                                // surface, muted text that still reads (5.36:1)
                                scales: {
                                    x: {
                                        grid: { display: false },
                                        border: { color: axis, width: 1 },
                                        ticks: { color: tick, font: { size: 11, weight: "500" }, maxRotation: 0, autoSkipPadding: 6 },
                                    },
                                    y: {
                                        beginAtZero: true,
                                        border: { display: false },
                                        grid: { color: grid, lineWidth: 1 },
                                        ticks: { color: tick, font: { size: 11 }, maxTicksLimit: 5, callback: (value) => compact(value) },
                                    },
                                },
                            }}
                        />
                    </div>
                    )}
                </>
            )}
        </div>
    );
}

export default CollectionsCard;
