import { forwardRef } from "react";

/**
 * The one button.
 *
 * Before this there was no button hierarchy — there were seven separate
 * components (`ActionButton`, `DeleteButton`, `CloseButton`, `PreviousButton`,
 * `ReprintButton`, `SeeLogsButton`, `ResetButton`) plus Material Tailwind's own
 * `Button` used raw in ~200 places, each choosing its own padding, radius,
 * shadow and colour at the call site. The result is that "the main action on
 * this screen" and "a minor link" are frequently the same weight, and a delete
 * looks like a save on half the screens.
 *
 * Five variants, and only five, because the hierarchy is the point:
 *
 *   primary      one per screen — the thing the screen is for
 *   secondary    supporting actions that are still full actions
 *   ghost        low emphasis; cancel, back, dismiss
 *   destructive  deletes and anything irreversible
 *   icon         compact, contextual, always tooltip-labelled
 *
 * CLASSIC IS UNTOUCHED. Every colour below is a fixed utility, and the themed
 * refinements (hover lift, accent fill, focus ring) come from the existing
 * `[data-ui-theme] .app-actions button` rules in globals.css, which Classic
 * cannot match. Nothing that already renders is switched to this component
 * without an explicit change at its call site.
 *
 * `loading` is not cosmetic. Save and action buttons across this app do not
 * block a second click, and on a slow connection that has been producing
 * duplicate records. A loading button is `disabled` and `aria-busy`, so the
 * second click cannot land at all.
 */

const VARIANTS = {
    primary:
        "app-btn-primary bg-teal-500 text-white border-teal-600 " +
        "hover:bg-teal-600 active:bg-teal-700 shadow-sm",
    secondary:
        "app-btn-secondary bg-white text-blue-gray-800 border-blue-gray-200 " +
        "hover:bg-blue-gray-50 active:bg-blue-gray-100",
    ghost:
        "app-btn-ghost bg-transparent text-blue-gray-700 border-transparent " +
        "hover:bg-blue-gray-100/70 active:bg-blue-gray-200/70",
    destructive:
        "app-btn-destructive bg-rose-600 text-white border-rose-700 " +
        "hover:bg-rose-700 active:bg-rose-800 shadow-sm",
    icon:
        "app-btn-icon bg-transparent text-blue-gray-700 border-transparent " +
        "hover:bg-blue-gray-100 active:bg-blue-gray-200",
};

// One radius, two heights. `md` is the house control height — it matches
// `.app-field-shell`'s 2.4rem so a button never sits on a different baseline
// from the input beside it, which was a real alignment fault in filter rows.
const SIZES = {
    sm: "text-meta h-8 px-3 gap-1.5",
    md: "text-sm h-[2.4rem] px-4 gap-2",
};

const ICON_SIZES = {
    sm: "h-8 w-8",
    md: "h-[2.4rem] w-[2.4rem]",
};

function Spinner({ className = "" }) {
    return (
        <svg className={`animate-spin h-4 w-4 shrink-0 ${className}`} viewBox="0 0 24 24"
            fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-90" fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8v3a5 5 0 0 0-5 5H4z" />
        </svg>
    );
}

const AppButton = forwardRef(function AppButton({
    variant = "secondary",
    size = "md",
    loading = false,
    disabled = false,
    icon: Icon,
    iconRight = false,
    type = "button",
    className = "",
    children,
    ...rest
}, ref) {
    const isIcon = variant === "icon";
    const blocked = disabled || loading;

    return (
        <button
            ref={ref}
            type={type}
            disabled={blocked}
            aria-busy={loading || undefined}
            className={`app-btn inline-flex items-center justify-center rounded-lg border
                font-semibold normal-case whitespace-nowrap select-none
                transition-colors duration-150
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1
                focus-visible:ring-teal-500
                disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none
                ${isIcon ? ICON_SIZES[size] : SIZES[size]}
                ${VARIANTS[variant] || VARIANTS.secondary} ${className}`}
            {...rest}>
            {/* The spinner REPLACES the leading icon rather than joining it, so
                the button never changes width mid-request and shifts the row of
                controls beside it. */}
            {loading ? <Spinner /> : (Icon && !iconRight ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null)}
            {!isIcon && children}
            {!loading && Icon && iconRight ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
            {isIcon && children}
        </button>
    );
});

export default AppButton;
export { Spinner as ButtonSpinner };
