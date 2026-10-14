import { useAppContext } from "@/contexts/AppContext";
import { CalendarDaysIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * The academic year the screen you are on is working in.
 *
 * This replaces `<Warning warning="Select correct academic year please!" />`,
 * which was rendered unconditionally on six screens. It had three problems, and
 * all three are the same problem seen from different sides:
 *
 *  · it never went away. It said the same thing whether the year was right,
 *    wrong or missing, so after the first week nobody read it — and the one
 *    time it mattered it looked exactly like the six hundred times it didn't;
 *  · it was an amber alert. Alert styling is a promise that something is wrong;
 *    spending it on a standing instruction means a genuinely wrong year has no
 *    louder register left to shout in;
 *  · it asked for an action without offering it. The year lives in a popover
 *    behind a calendar icon in the header — one that is a 24px glyph on a
 *    phone — so the notice pointed off-screen and stopped there.
 *
 * So: state the year instead of nagging about it, quietly, on one line; and
 * make the notice itself the way to change it. It only raises its voice — amber,
 * alert role — when no academic year is actually set, which is the case that
 * was drowning in the noise.
 */
function AcademicYearNotice({ note = "" }) {
    const { fiscalYear: { year, getNameFromAcademicYear, setShowFiscalYearPicker } } = useAppContext();
    const missing = !year?.academic_year;
    // `academic_year_name` is filled in when the year is chosen, but a closed
    // year picked on a report screen only ever carries its id, so fall back to
    // looking the name up rather than printing a database id at the user.
    const name = year?.academic_year_name || getNameFromAcademicYear?.(year?.academic_year) || "";

    function openPicker() {
        // The picker renders at the top of the scrolling view, so on a page the
        // user has scrolled down it would otherwise open out of sight.
        document.querySelector('.viewc')?.scrollTo({ top: 0, behavior: 'smooth' });
        setShowFiscalYearPicker(true);
    }

    if (missing) {
        return (
            <div role="alert"
                className="app-warn hide-from-print w-full mb-3 flex flex-wrap items-center gap-x-3 gap-y-1
                    rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2">
                <span className="app-warn-icon shrink-0 grid place-items-center h-7 w-7 rounded-lg
                    bg-amber-500/12 text-amber-600">
                    <ExclamationTriangleIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="min-w-0 flex-1 text-sm font-semibold leading-5 text-amber-900">
                    No academic year is selected — this screen has nothing to save into.
                </p>
                <button type="button" onClick={openPicker}
                    className="app-yr-btn shrink-0 rounded-lg border border-amber-300 bg-white/70 px-2.5 py-1
                        text-xs font-semibold text-amber-900 hover:bg-white">
                    Select year
                </button>
            </div>
        );
    }

    return (
        <div className="app-yearbar hide-from-print w-full mb-3 flex flex-wrap items-center gap-x-3 gap-y-1
            rounded-xl border border-sky-200/70 bg-sky-50/60 px-3 py-1.5">
            <CalendarDaysIcon className="app-yearbar-icon h-4 w-4 shrink-0 text-sky-600" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-5 text-gray-700">
                Academic year
                <span className="app-yearbar-value ml-1.5 font-bold text-sky-900">{name || "—"}</span>
                {note && <span className="ml-2 text-gray-500">{note}</span>}
            </p>
            <button type="button" onClick={openPicker}
                className="app-yr-btn shrink-0 rounded-lg border border-sky-200 bg-white/80 px-2.5 py-1
                    text-xs font-semibold text-sky-800 hover:bg-white">
                Change
            </button>
        </div>
    );
}

export default AcademicYearNotice;
