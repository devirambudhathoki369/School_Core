import { useEffect, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { InformationCircleIcon } from "@heroicons/react/24/solid";

// if interval is passed, it can't be dismissed, it redisplays after the given interval!
function AttentionBox({ title, description, dismissable = true, interval = null }) {
    const [open, setOpen] = useState(true);

    function onClose() {
        setOpen(false);
    }

    useEffect(() => {
        if (typeof interval === "number" && !isNaN(interval)) {
            const timer = setInterval(() => {
                setOpen(true);
            }, interval);

            return () => clearInterval(timer);
        }
        return undefined;
    }, []);

    if (!open) return null;

    /**
     * A notice belongs to the column it sits in, not to the middle of the page.
     *
     * This was `sm:w-max mx-auto`, which sized the box to its longest line and
     * then centred it — so "1 devices found" became a small tile hovering in
     * the middle of an otherwise empty screen, attached to nothing above or
     * below it. It read as a stray dialog rather than a note about the page.
     *
     * Full width, left aligned, and the type scaled back to what a subtitle
     * deserves: an `h6` at `text-xl` was competing with the page itself. This
     * is context, not a headline.
     */
    return (
        <div className="app-note hide-from-print relative w-full mb-3 flex items-start gap-3
            rounded-xl border border-sky-200/70 bg-sky-50
            px-4 py-3 shadow-sm">
            <span className="app-note-icon mt-0.5 shrink-0 grid place-items-center h-8 w-8 rounded-lg
                bg-sky-500/10 text-sky-600">
                <InformationCircleIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1 pr-6">
                <h6 className="app-note-title text-[0.95rem] font-semibold leading-5 text-gray-900">{title}</h6>
                {description && (
                    <p className="app-note-body mt-0.5 text-[0.85rem] leading-5 text-gray-600 whitespace-pre-wrap">
                        {description}
                    </p>
                )}
            </div>
            {dismissable && (
                // type="button": this note sits inside send forms, where a
                // bare <button> is a submit — closing the note sent the SMS.
                <button type="button" aria-label="dismiss" onClick={onClose}
                    className="app-note-x absolute top-2.5 right-2.5 rounded-md p-1 text-gray-400
                        hover:text-gray-700 hover:bg-black/5 transition-colors">
                    <XMarkIcon className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}

export default AttentionBox;
