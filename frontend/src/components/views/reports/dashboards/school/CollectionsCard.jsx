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
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ui-theme"] });
        return () => watch.disconnect();
    }, [variable, fallback]);
    return colour;
}
const faded = (rgb, alpha) => (rgb.startsWith("rgb(") ? rgb.replace("rgb(", "rgba(").replace(")", `, ${alpha})`) : rgb);

function Figure({ label, value, strong = false }) {
    return (
        <div className="min-w-0">
            {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
            <div className="truncate text-xs font-semibold text-[var(--ink-500)]">{label}</div>
            <div className={`truncate font-extrabold tabular-nums leading-tight text-[var(--ink-900)] ${strong ? "text-[1.65rem]" : "text-[1.05rem]"}`}>{value}</div>
        </div>
    );
}

/**
 * What the school has collected this economic year, month by month.
 *
 * Twelve separate totals are twelve columns. The line this replaces drew a
 * smooth curve through them, which showed dips and rises BETWEEN months that
 * never happened, and it had no total anywhere. The month in progress is the
 * full colour; the months behind it are a lighter step of the same one.
 *
 *   monthsList  [4, 5, 6]            BS month numbers, as the server sends them
 *   amounts     [35950, 326100, …]   the same length
 *   yearName    "EY2083/084"
 *   today       "2083-06-18"         the BS date, to know the month in progress
 */
function CollectionsCard({ monthsList, amounts, yearName, today }) {
    const colour = useThemeColour("--t-brand-solid", "rgb(13, 148, 136)");
    const rows = useMemo(() => (monthsList || []).map((m, i) => ({ month: parseInt(m, 10), amount: Number(amounts?.[i]) || 0 })), [monthsList, amounts]);
    const total = rows.reduce((n, r) => n + r.amount, 0);
    const current = parseInt(`${today || ""}`.split("-")[1], 10) || null;
    const thisMonth = rows.find((r) => r.month === current);
    const best = rows.reduce((top, r) => (r.amount > (top?.amount || 0) ? r : top), null);
    const marksCurrent = rows.some((r) => r.month === current);

    return (
        <div className="app-panel flex h-full flex-col rounded-xl border bg-white p-4">
            <div className="flex items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-gray-700">Fee collections</h3>
                {yearName && <span className="shrink-0 text-xs font-semibold text-[var(--ink-500)]">{yearName}</span>}
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
                    <div className="mt-3 h-[11.5rem] min-h-0 flex-1" role="img"
                        aria-label={`Collections by month: ${rows.map((r) => `${monthName(r.month)} ${rupees(r.amount)}`).join(", ")}`}>
                        <Bar
                            data={{
                                labels: rows.map((r) => monthName(r.month)),
                                datasets: [{
                                    data: rows.map((r) => r.amount),
                                    backgroundColor: rows.map((r) => (!marksCurrent ? faded(colour, 0.6) : r.month === current ? colour : faded(colour, 0.3))),
                                    hoverBackgroundColor: colour,
                                    borderRadius: { topLeft: 4, topRight: 4 },
                                    borderSkipped: "bottom",
                                    // a few months in: solid columns, not slivers; a full
                                    // year: twelve that still fit
                                    maxBarThickness: 40,
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
                                scales: {
                                    x: {
                                        grid: { display: false },
                                        border: { color: "#e2e8f0" },
                                        ticks: { color: "#64748b", font: { size: 11, weight: "500" }, maxRotation: 0, autoSkipPadding: 6 },
                                    },
                                    y: {
                                        beginAtZero: true,
                                        border: { display: false },
                                        grid: { color: "#eef2f7" },
                                        ticks: { color: "#94a3b8", font: { size: 11 }, maxTicksLimit: 5, callback: (value) => compact(value) },
                                    },
                                },
                            }}
                        />
                    </div>
                </>
            )}
        </div>
    );
}

export default CollectionsCard;
