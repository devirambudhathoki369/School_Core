import { FunnelIcon, ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";

import FormSaveButton from "@/components/buttons/FormSaveButton";
import ResetButton from "@/components/buttons/ResetButton";

/**
 * The standard search block.
 *
 * Every "find a student / find a staff member" panel in the app is this
 * component, so they cannot drift apart again. What it replaces, and why:
 *
 * - The body was `bg-teal-100`, a hard-coded mint slab. On the blue and green
 *   themes that is simply the wrong colour, and it is the single thing that
 *   made a themed page look half-painted. The panel is now a white card with a
 *   tinted header drawn from `var(--t-brand-solid, …)`, so it is teal on
 *   Classic and the school's own accent on every theme, with no per-theme
 *   markup.
 * - The staff panel was additionally `fixed` at a computed width, so it floated
 *   over the page and its own scrollbar. It is in the flow now, like the
 *   student one always was.
 * - The action row read "Close · Reset · Search" — three controls of equal
 *   weight, with Close duplicating the header's own collapse. Collapsing is the
 *   header's job; the row now carries Reset and Search only, Search last where
 *   the eye finishes.
 *
 * The whole header is the toggle, and it stays visible when collapsed so the
 * search is always one click away.
 */
function SearchPanel({
    title,
    open,
    onToggle,
    onSubmit,
    onReset,
    searching = false,
    activeCount = 0,
    // Optional: `[{ key, label, value }]` from `activeFilters()`. When given,
    // the panel lists the live filters as removable chips under its header.
    filters = null,
    onRemoveFilter = null,
    children,
}) {
    // The row of active-filter chips below the header renders on every palette.
    // It was gated to themed schools as "a new surface", but it is drawn
    // entirely in neutral greys and what it says — WHICH filters are currently
    // narrowing the search, and a way to drop one — is the answer to "why am I
    // seeing these rows and not those". That question is not a matter of colour.
    return (
        <section className="app-search-panel mb-3 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <button type="button" onClick={onToggle} aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{
                        backgroundColor: "color-mix(in srgb, var(--t-brand-solid, #0d9488) 13%, #fff)",
                        color: "var(--t-brand-solid, #0d9488)",
                    }}>
                    <FunnelIcon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[0.95rem] font-semibold text-gray-900">{title}</span>
                    <span className="block text-xs text-gray-500">
                        {open ? "Fill what you know, then search." : "Tap to change the filters."}
                    </span>
                </span>
                {/* How many filters are actually narrowing the search — the
                    thing you want to know at a glance once it is collapsed. */}
                {activeCount > 0 && (
                    <span className="shrink-0 rounded-full px-2.5 py-1 text-[0.7rem] font-bold text-white"
                        style={{ backgroundColor: "var(--t-brand-solid, #0d9488)" }}>
                        {activeCount} filter{activeCount === 1 ? "" : "s"}
                    </span>
                )}
                <ChevronDownIcon className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>

            {/* Which filters are on, and how to drop one.
                The count chip above says results are narrowed but never says by
                what — so the only way to find out was to reopen the panel and
                read every field, and the only way to lift a single filter was to
                clear that field by hand or Reset all of them. These are the same
                filters, named, each removable on its own.

                Rendered only when the caller passes `filters`, so no existing
                call site changes until it opts in. Sits OUTSIDE the collapsible
                body on purpose: its whole value is being readable while the
                panel is shut. */}
            {filters?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 px-4 py-2.5">
                    {filters.map((f) => (
                        <span key={f.key}
                            className="app-filter-pill inline-flex items-center gap-1.5 rounded-md
                                bg-gray-50 px-2 py-1 text-[0.72rem] font-medium text-gray-700
                                ring-1 ring-inset ring-gray-200">
                            <span className="text-gray-400">{f.label}:</span>
                            <span className="font-semibold">{f.value}</span>
                            {onRemoveFilter && (
                                <button type="button"
                                    onClick={() => onRemoveFilter(f.key)}
                                    aria-label={`Remove ${f.label} filter`}
                                    className="-mr-0.5 rounded p-0.5 text-gray-400 transition
                                        hover:bg-gray-200 hover:text-gray-700">
                                    <XMarkIcon className="h-3 w-3" aria-hidden="true" />
                                </button>
                            )}
                        </span>
                    ))}
                    {onReset && filters.length > 1 && (
                        <button type="button" onClick={onReset}
                            className="ml-1 rounded px-1.5 py-1 text-[0.72rem] font-semibold
                                text-gray-500 underline-offset-2 transition hover:text-gray-800 hover:underline">
                            Clear all
                        </button>
                    )}
                </div>
            )}

            {open && (
                <form onSubmit={onSubmit} className="border-t border-gray-100">
                    <div className="px-4 py-4">
                        {children}
                    </div>
                    {/* Actions belong to the form and sit on its edge, not
                        floating under it. Search is last and primary. The two
                        stand together under the middle of the form: at opposite
                        corners of a wide panel, Reset and Search were a screen
                        apart and neither sat near the fields. */}
                    <div className="app-actions app-search-actions flex flex-col-reverse items-stretch justify-center gap-2 border-t border-gray-200
                                    bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                        <ResetButton onClick={onReset}>Reset</ResetButton>
                        <FormSaveButton isSearch={true} searching={searching} />
                    </div>
                </form>
            )}
        </section>
    );
}

export default SearchPanel;
