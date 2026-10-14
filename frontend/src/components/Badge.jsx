/**
 * The one status badge.
 *
 * The app had no status vocabulary at all. `Status.jsx` drew a green tick or a
 * red cross, and everything else was an inline pill written from scratch at the
 * call site — eleven files carry their own `rounded-full` + `bg-…-200` +
 * `text-…-700` combination, each with its own padding, radius and weight. So
 * "active" looks like one thing on the device list, another on the fee setup,
 * and nothing at all on the six screens that just print the raw word.
 *
 * This follows the pattern `methods/getStatusColor.js` already established for
 * notifications: the caller names the MEANING, not the colour, and one place
 * decides what a meaning looks like. That is what lets a theme reach it.
 *
 * CLASSIC IS UNTOUCHED — the palettes here are fixed Tailwind utilities that
 * render identically with or without a theme, and the only themed rule is the
 * shared `.app-badge` shape hook. Nothing existing is re-rendered through this
 * component without an explicit change at the call site.
 *
 * Semantic colour is FIXED ACROSS THEMES on purpose: present is green and
 * absent is red on every palette, because a teacher reading an attendance grid
 * should never have to re-learn the colours when their school changes theme.
 */

const TONES = {
    // positive / terminal-good
    success: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    // in-flight, needs attention but not wrong
    warning: "bg-amber-50 text-amber-800 ring-amber-600/25",
    // failed / terminal-bad
    danger: "bg-rose-50 text-rose-700 ring-rose-600/20",
    // informational, no judgement
    info: "bg-sky-50 text-sky-700 ring-sky-600/20",
    // not started, archived, switched off
    neutral: "bg-blue-gray-50 text-blue-gray-700 ring-blue-gray-600/20",
};

/**
 * The vocabulary this product actually uses, mapped once.
 *
 * Keys are lower-cased and matched loosely so a backend that sends "Active",
 * "ACTIVE" or `true` all land in the same place. Anything unrecognised falls to
 * `neutral` and renders the caller's own text — an unknown status must still be
 * legible, never blank.
 */
const VOCABULARY = {
    active: "success",
    present: "success",
    paid: "success",
    approved: "success",
    completed: "success",
    verified: "success",
    success: "success",
    open: "success",
    running: "info",
    pending: "warning",
    partial: "warning",
    due: "warning", 
    late: "warning",
    draft: "warning",
    unpaid: "danger",
    absent: "danger",
    rejected: "danger",
    failed: "danger",
    expired: "danger",
    cancelled: "danger",
    inactive: "neutral",
    archived: "neutral",
    closed: "neutral",
    disabled: "neutral",
};

export function toneFor(status) {
    if (status === true) return "success";
    if (status === false) return "neutral";
    return VOCABULARY[String(status ?? "").trim().toLowerCase()] || "neutral";
}

/**
 * @param {string} [children]  The label. Defaults to the status itself.
 * @param {string|boolean} status  A word from the vocabulary above, or a bool.
 * @param {string} [tone]  Override the derived tone when the label is free text.
 * @param {boolean} [dot=true]  The colour dot. Off for very dense tables.
 * @param {"sm"|"md"} [size="sm"]
 */
function Badge({ children, status, tone, dot = true, size = "sm", className = "", title }) {
    const key = tone || toneFor(status);
    const label = children ?? (typeof status === "string" ? status : (status ? "Active" : "Inactive"));
    const sizing = size === "md"
        ? "text-meta px-2.5 py-1 gap-1.5"
        : "text-label px-2 py-0.5 gap-1";

    return (
        // `ring-1 ring-inset` rather than `border`: a border adds a pixel to the
        // box and pushes table rows out of alignment with the unbadged cells
        // beside them. An inset ring is drawn inside the same box.
        //
        // A pill is deliberately NOT used — `rounded-md` keeps badges reading as
        // part of the same family as the buttons and inputs, which are all on
        // the same radius scale. Fully-round pills were one of the sources of
        // "random rounded corners everywhere".
        <span
            title={title}
            className={`app-badge inline-flex items-center rounded-md font-semibold
                whitespace-nowrap ring-1 ring-inset align-middle
                ${sizing} ${TONES[key] || TONES.neutral} ${className}`}>
            {dot && (
                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70 shrink-0"
                    aria-hidden="true" />
            )}
            {/* The word carries the meaning for anyone who cannot see the
                colour, so it is never replaced by the dot alone. */}
            {label}
        </span>
    );
}

export default Badge;
