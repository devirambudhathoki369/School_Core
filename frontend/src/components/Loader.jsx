import { ExclamationCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";
import { SkeletonTable, SkeletonCards, SkeletonForm, SkeletonText } from "@/components/Skeleton";

/**
 * The waiting state, used in 104 files.
 *
 * It shows a skeleton of the thing being fetched. Two reasons:
 *
 * 1. A spinner on blank canvas gives no clue what is arriving, and the eye has
 *    nothing to settle on, so the wait feels longer than it is. A silhouette
 *    that matches the incoming layout also stops the page jumping when data
 *    lands, because the space is already reserved.
 * 2. The old timeout was a real defect. After `minutes` (default THREE) the
 *    spinner silently became the words "Not found!" — which is a claim about
 *    the data, not about the request. A slow network was being reported to the
 *    user as an empty database, with no way to tell the difference and no way
 *    to retry. It now says the request is taking too long and offers a retry.
 *
 * BOTH USED TO BE THEMED-ONLY, and point 2 is why that could not stand: the
 * schools on Classic — most of them — were the ones still being told their data
 * did not exist every time the network was slow. A misleading error message is
 * not a palette choice. The class names below all resolve from
 * `--t-brand-solid`, which now has a Classic default, so this renders correctly
 * on every school and a theme only changes the hue.
 *
 * `variant` picks the silhouette: most of this app's waiting is for a table, so
 * that is the default. Callers that are loading something else can say so
 * without touching their own markup.
 */
function Loader({ minutes = 3, variant = "table", rows, cols, onRetry, label = "Loading" }) {
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timeout = setTimeout(() => {
            setLoading(false);
        }, 1000 * 60 * minutes);
        return () => {
            clearTimeout(timeout);
        }
    }, [])

    // ---- the request has outlived its budget: say so honestly, offer a way out ----
    if (!loading) {
        return (
            <div className="app-empty w-full flex flex-col items-center justify-center text-center
                rounded-xl border border-dashed px-6 py-10 sm:py-14" role="status">
                <span className="app-empty-icon grid place-items-center h-14 w-14 rounded-2xl">
                    <ExclamationCircleIcon className="h-7 w-7" />
                </span>
                <h3 className="app-empty-title mt-4 text-base font-semibold">This is taking longer than expected</h3>
                <p className="app-empty-hint mt-1 max-w-sm text-body leading-5">
                    The request has not come back yet. That usually means a slow connection
                    rather than missing data.
                </p>
                <button
                    type="button"
                    onClick={() => {
                        setLoading(true);
                        if (onRetry) onRetry();
                        else if (typeof window !== "undefined") window.location.reload();
                    }}
                    className="app-retry-btn mt-4 inline-flex items-center gap-2 rounded-lg px-3.5 py-2
                        text-sm font-semibold transition">
                    <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
                    Try again
                </button>
            </div>
        );
    }

    const silhouettes = {
        table: <SkeletonTable rows={rows ?? 6} cols={cols ?? 5} />,
        cards: <SkeletonCards count={cols ?? 4} />,
        form: <SkeletonForm fields={rows ?? 6} />,
        text: <SkeletonText lines={rows ?? 3} />,
    };

    return (
        // The bars are decorative, so the announcement has to be made in text a
        // screen reader can read; `sr-only` keeps it out of the visual design.
        <div className="w-full" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{label}…</span>
            {silhouettes[variant] || silhouettes.table}
        </div>
    )
}

export default Loader;
