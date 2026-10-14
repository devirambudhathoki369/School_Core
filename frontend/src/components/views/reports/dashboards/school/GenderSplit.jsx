// How many male, how many female — as numbers.
//
// This was a pie. A pie of two close slices answers neither question the card
// is opened for: 190 against 173 looks like "about half", the counts were only
// reachable by hovering, and the legend sat below a 288px drawing. The bar says
// the same "about half" in 12px, and the counts and shares are printed.
//
// The three colours are fixed to the gender, not to the school's theme, and
// were checked as neighbours for colour-blind separation on a white surface.
const PARTS = [
    { key: "male", label: "Male", colour: "#2a78d6" },
    { key: "female", label: "Female", colour: "#eb6834" },
    { key: "others", label: "Others", colour: "#1baf7a" },
];

// Shares to one decimal that add up to exactly 100 (largest remainder): three
// shares each rounded on its own can come to 99.9 or 100.1.
export function shares(values) {
    const total = values.reduce((n, v) => n + v, 0);
    if (!total) return values.map(() => 0);
    const exact = values.map((v) => (v / total) * 1000);
    const tenths = exact.map(Math.floor);
    let left = 1000 - tenths.reduce((n, v) => n + v, 0);
    exact.map((v, i) => [v - tenths[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => {
        if (left > 0) { tenths[i] += 1; left -= 1; }
    });
    return tenths.map((v) => v / 10);
}

const percent = (share) => `${Number.isInteger(share) ? share : share.toFixed(1)}%`;

/**
 *   title      "Running Students"
 *   counts     { male, female, others }
 *   emptyHint  what to say when there is nobody to count
 */
function GenderSplit({ title, counts, emptyHint }) {
    const parts = PARTS.map((part) => ({ ...part, value: Number(counts?.[part.key]) || 0 }));
    const total = parts.reduce((n, part) => n + part.value, 0);
    const share = shares(parts.map((part) => part.value));
    const inWords = parts.map((part, i) => `${part.label} ${part.value} (${percent(share[i])})`).join(", ");

    return (
        <div className="app-panel rounded-xl bg-white/70 shadow-md border border-teal-100 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-600">
                    {title}{" "}
                    {/* sizes on every leaf: the global `*` font-size rule means nothing here inherits one */}
                    <span className="text-xs font-medium normal-case tracking-normal text-[var(--ink-500)]">by gender</span>
                </h3>
                <span className="shrink-0 text-xs font-semibold text-[var(--ink-500)]">
                    Total <b className="text-sm font-bold text-[var(--ink-900)]">{total}</b>
                </span>
            </div>

            {total === 0
                ? <p className="mt-2 text-[13px] leading-snug text-[var(--ink-500)]">{emptyHint}</p>
                : (
                    <>
                        {/* one bar, split by share; the gap between two parts is the card showing through */}
                        <div role="img" aria-label={`${title} by gender: ${inWords}`} className="mt-3 flex h-3 w-full gap-[2px]">
                            {parts.map((part, i) => part.value > 0 &&
                                <span key={part.key} title={`${part.label}: ${part.value} (${percent(share[i])})`}
                                    className="h-full min-w-[3px] first:rounded-l-[4px] last:rounded-r-[4px]"
                                    style={{ flexGrow: part.value, flexBasis: 0, backgroundColor: part.colour }}></span>)}
                        </div>
                        <dl className="mt-3 grid grid-cols-3 gap-x-3">
                            {parts.map((part, i) => (
                                <div key={part.key} className="min-w-0">
                                    <dt className="flex items-center gap-x-1.5">
                                        <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: part.colour }} aria-hidden="true"></span>
                                        <span className="text-xs font-semibold text-[var(--ink-600)]">{part.label}</span>
                                    </dt>
                                    <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                                        <span className={`text-lg font-bold leading-tight ${part.value > 0 ? "text-[var(--ink-900)]" : "text-[var(--ink-400)]"}`}>{part.value}</span>
                                        <span className="text-xs font-medium text-[var(--ink-500)]">{percent(share[i])}</span>
                                    </dd>
                                </div>
                            ))}
                        </dl>
                    </>
                )}
        </div>
    );
}

export default GenderSplit;
