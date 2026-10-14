/**
 * Skeletons — the shape of the answer, drawn while the answer loads.
 *
 * There were none in this codebase: every one of the 100-odd loading states was
 * a centred spinner on blank canvas. A spinner says "something is happening";
 * a skeleton says "a table is coming, and it will have these columns", which is
 * the difference between a page that feels slow and one that feels fast.
 *
 * THEMED SURFACES ONLY. Every rule these class names resolve to lives under
 * `[data-ui-theme]` in globals.css, and nothing here is rendered at all on
 * Classic — `Loader` keeps its spinner there. See the header of the INTERFACE
 * THEMES block for why that guarantee is structural rather than a promise.
 *
 * The bars carry no text, so they are hidden from assistive tech entirely and
 * the live region announcing "Loading…" is the caller's job (`Loader` does it).
 */

/** One bar. `w` is any CSS length or percentage. */
export function SkeletonLine({ w = "100%", h = "0.75rem", className = "" }) {
    return <span className={`app-skel block rounded-md ${className}`} style={{ width: w, height: h }} />;
}

/**
 * A table's silhouette: a heading strip, then rows of cells.
 *
 * Column widths are staggered rather than uniform — an even grid of identical
 * bars reads as a loading graphic, while uneven ones read as real content that
 * has not arrived. The stagger is deterministic so it does not flicker between
 * renders.
 */
export function SkeletonTable({ rows = 6, cols = 5 }) {
    const widths = ["58%", "82%", "44%", "70%", "36%", "64%", "50%"];
    return (
        <div className="app-skel-card w-full overflow-hidden rounded-xl" aria-hidden="true">
            <div className="app-skel-head flex items-center gap-4 px-4 py-3">
                {Array.from({ length: cols }).map((_, c) => (
                    <SkeletonLine key={c} w={widths[(c + 2) % widths.length]} h="0.7rem" className="flex-1" />
                ))}
            </div>
            <div className="divide-y app-skel-divide">
                {Array.from({ length: rows }).map((_, r) => (
                    <div key={r} className="flex items-center gap-4 px-4 py-3.5">
                        {Array.from({ length: cols }).map((_, c) => (
                            <SkeletonLine key={c} w={widths[(r + c) % widths.length]} className="flex-1" />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** The four summary tiles a dashboard opens with. */
export function SkeletonCards({ count = 4 }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full" aria-hidden="true">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="app-skel-card rounded-xl p-4 flex flex-col gap-3">
                    <SkeletonLine w="45%" h="0.65rem" />
                    <SkeletonLine w="70%" h="1.4rem" />
                    <SkeletonLine w="35%" h="0.6rem" />
                </div>
            ))}
        </div>
    );
}

/** A form's silhouette: label-and-field pairs on the house 12-column grid. */
export function SkeletonForm({ fields = 6 }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-4 gap-y-5 w-full" aria-hidden="true">
            {Array.from({ length: fields }).map((_, i) => (
                <div key={i} className="sm:col-span-4 flex flex-col gap-2">
                    <SkeletonLine w="38%" h="0.6rem" />
                    <SkeletonLine w="100%" h="2.4rem" />
                </div>
            ))}
        </div>
    );
}

/** Generic body copy, for a panel whose shape is not known ahead of time. */
export function SkeletonText({ lines = 3 }) {
    const widths = ["100%", "92%", "76%", "88%", "60%"];
    return (
        <div className="w-full flex flex-col gap-2.5" aria-hidden="true">
            {Array.from({ length: lines }).map((_, i) => (
                <SkeletonLine key={i} w={widths[i % widths.length]} />
            ))}
        </div>
    );
}

export default SkeletonTable;
