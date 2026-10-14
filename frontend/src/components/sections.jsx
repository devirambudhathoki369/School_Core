import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from "@heroicons/react/24/outline";
import { Button, Chip, Typography } from "@material-tailwind/react";

// `className` lands on the GRID, not on the section — it exists so a form can
// correct its own row alignment. `.mygrid` bottom-aligns (`items-end`), which is
// right until one field in a row carries a hint under it: that field's input
// then sits a line higher than the ones beside it, and the row reads as broken.
// Such a form passes `!items-start` — labels are one line everywhere, so tops
// align exactly and the hint hangs below where it belongs.
export function Section({ title, description, children, grid = true, actions, className = '' }) {
    return (
        <div className="app-section border-b border-blue-gray-100 pb-6 mb-6">
            {(title || description || actions) && (
                <div className="section-header flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        {title && (
                            <h2 className="app-section-title flex items-center gap-2 min-w-0">
                                {/* The accent bar is what tells you a section
                                    started — one flat bar in the palette's own
                                    accent (it was a teal→sky gradient). The
                                    title's size lives on `.app-section-title`,
                                    because the global `*` rule sets a font
                                    size on EVERY element and so used to shrink
                                    this span to body size whatever the <h2>
                                    asked for. */}
                                <span className="app-section-accent inline-block h-4 w-1 rounded-full shrink-0" aria-hidden="true"></span>
                                <span className="truncate">{title}</span>
                            </h2>
                        )}
                        {description && (
                            <p className="app-section-desc pl-3 mt-0.5 whitespace-pre-wrap">{description}</p>
                        )}
                    </div>
                    {actions?.length > 0 && (
                        <div className="flex flex-wrap gap-2 shrink-0">
                            {actions.map((action, i) => (
                                <span key={i}>{action}</span>
                            ))}
                        </div>
                    )}
                </div>
            )}
            <div className={`mt-5 ${grid ? 'mygrid' : ''} ${className}`}>
                {children}
            </div>
        </div>
    )
}

export function FormSection({ children, title, description }) {
    return (
        <div className="border-b-2 border-gray-500 pb-12">
            <h2 className="text-xl font-semibold leading-7 text-gray-900">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-gray-600">{description}</p>
            <div className="mt-5 mygrid">
                {children}
            </div>
        </div>
    )
}

export function ButtonsSecion({ children, className }) {
    // CENTRED in a row once there is room. They were pushed to the right edge,
    // which on a wide screen left Save or Search a whole window's width away
    // from the fields it acts on; under the middle of the form the eye and the
    // pointer travel the same short way from any field. A caller that needs a
    // different shape says so (`justify-between` for a total beside its
    // button, `!justify-start` for a lone Back). On a phone they stack and
    // fill the width instead, which is also a bigger tap target.
    //
    // NO `h-full`. It used to be here, and it is why several pages opened onto
    // a screen of empty canvas: `.viewc` is a flex child with a resolved height,
    // so `h-full` made this tray as tall as the whole scroll area — measured at
    // 894px against a 31px row of buttons. Where the tray sits above the form
    // (Accounting ▸ Expense Entry, and everything shaped like it) that pushed
    // the first field off the bottom of the window, and `sm:items-center` left
    // the buttons floating in the middle of the void. A row of actions is as
    // tall as its actions.
    return (
        <div className={`app-actions w-full flex flex-col sm:flex-row justify-center items-stretch sm:items-center gap-2 sm:gap-x-2.5 ${className}`}>
            {children}
        </div>
    )
}

export function FilterSection({ children, title }) {
    // On mobile we stack title-above-content with a top border so the form
    // remains readable at narrow widths; from sm+ we restore the original
    // side-by-side label / fields layout.
    //
    // The label column used to be separated by a 2px SOLID BLACK rule, which is
    // heavier than anything else on the page and made every filter row read as
    // a table. It is a hairline now, and the label is set as a label — small,
    // tracked, upper — rather than as body text the same size as the values it
    // is introducing.
    //
    // The two columns were sized `sm:w-[10vw]` and `sm:w-[80%]` — a VIEWPORT
    // unit against a PERCENTAGE of a container. They never summed to the row,
    // so the fields left a dead gutter on a wide screen, and on a laptop the
    // label column collapsed to ~100px and "Choose education level" broke over
    // three lines. A fixed rem column that cannot shrink, and a body that takes
    // exactly what is left, holds the same shape at every width.
    // The side-by-side switch is `md`, NOT `sm`. `withMT()` replaces Tailwind's
    // screens with its own — `sm` here is 540px, not 640 — so an `sm:` two-
    // column form snapped into its desktop shape on a large phone, where a
    // 176px label column plus a twelve-column field grid leaves each field
    // about 90px wide. 720px is where both actually fit.
    return (
        <div className="app-filter-section sm:col-span-12 flex flex-col md:flex-row md:items-stretch">
            {/* The divider and the label keep Classic's own weight (2px black
                rule, body-size text); a theme quietens both to a hairline and a
                proper label via the `app-filter-*` hooks in globals.css. Only
                the SIZING changed here, and it changed for every palette. */}
            <div className="app-filter-divider shrink-0 pb-1.5 md:w-44 md:pb-0 md:pr-4 md:mr-4 md:border-r-2 md:border-black border-b-2 md:border-b-0 border-black/30">
                <Typography className="app-filter-label text-sm font-semibold">
                    {title}
                </Typography>
            </div>
            <div className="min-w-0 flex-1 flex flex-wrap pt-2 md:pt-0">
                {children}
            </div>
        </div>
    );
}

export function PaginationSection({ page, setPage, nextPage }) {
    // This is CURSOR pagination — the API returns a next-page URL, never a
    // total — so "page 3 of 12" is not available to show and is not invented
    // here. What was missing is cheaper and honest: the control had no
    // accessible name of any kind ("Prev"/"Next" with a decorative chevron and
    // a bare number between them), so a screen reader announced three unlabelled
    // buttons. `nav` + labels apply on every palette because an unlabelled
    // control is not a matter of taste.
    return (
        <nav aria-label="Pagination">
            <ButtonsSecion className={'justify-between items-center'}>
                <Button size="lg"
                    disabled={!page || page <= 1}
                    aria-label="Previous page"
                    onClick={() => { setPage(state => state - 1) }}
                    className="capitalize flex items-center p-3" variant="text" >
                    <ChevronDoubleLeftIcon className="icon" aria-hidden="true" /> Prev
                </Button>
                <Chip variant="ghost" size="sm" value={page} aria-current="page"
                    aria-label={`Page ${page}`}></Chip>
                <Button size="lg"
                    disabled={!nextPage}
                    aria-label="Next page"
                    onClick={() => { setPage(state => state + 1) }}
                    className="capitalize flex items-center p-3" variant="text" >
                    Next <ChevronDoubleRightIcon className="icon" aria-hidden="true" />
                </Button>
            </ButtonsSecion>
        </nav>
    )
}