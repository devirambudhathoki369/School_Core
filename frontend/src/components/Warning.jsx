import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * An inline warning about the screen you are on. Used in 23 files.
 *
 * It is a real inline alert, matching `AttentionBox` (which is the same idea in
 * an informational tone) so the two read as one family instead of two unrelated
 * notices. It replaces a centred, underlined red line — and every objection
 * below applied just as much to the Classic schools that were still seeing it,
 * which is why this is no longer gated on a theme:
 *
 *  · underline is dropped. It is the convention for a link, and these are not
 *    clickable — several of these warnings sit next to real links, so the one
 *    thing that looked most clickable on the row was the thing that wasn't;
 *  · centred text is dropped. A warning belongs to the column it sits in;
 *    centring detached it from whatever it was warning about;
 *  · `role="alert"` so it is announced. These appear in response to a choice
 *    the user just made (a class with no students, a locked fiscal year), which
 *    is exactly the case a screen reader otherwise misses.
 */
function Warning({ warning }) {
    return (
        <div role="alert"
            className="app-warn hide-from-print w-full mb-3 flex items-start gap-3
                rounded-xl border border-amber-200/80 bg-amber-50/70 px-4 py-3">
            <span className="app-warn-icon mt-0.5 shrink-0 grid place-items-center h-8 w-8 rounded-lg
                bg-amber-500/12 text-amber-600">
                <ExclamationTriangleIcon className="h-5 w-5" aria-hidden="true" />
            </span>
            {/* min-w-0 so a long multi-line warning wraps inside the box rather
                than forcing it wider than its column. */}
            <p className="min-w-0 flex-1 text-copy font-semibold leading-5 text-amber-900 whitespace-pre-wrap">
                {warning}
            </p>
        </div>
    )
}

export default Warning;
