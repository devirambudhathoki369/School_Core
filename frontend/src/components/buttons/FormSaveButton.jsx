import { Button } from "@material-tailwind/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { ButtonSpinner } from "@/components/buttons";


/**
 * The submit button on 112 screens.
 *
 * custom [status, textBeforeSubmit, textWhileSubmitting]
 *
 * While a save is in flight it shows a spinner. The label already changed to
 * "Saving…", but a word is easy to miss on a wide form where the button sits far
 * from where the user is looking, and there was no other signal that anything
 * was happening. The button was already correctly disabled while in flight, so
 * this is about making that visible rather than about blocking the second click.
 *
 * The spinner used to be themed-only. "Did my click register?" is the question
 * behind every duplicate record this product has ever produced, and it is not a
 * question about colour — so every school gets the answer now.
 */
function FormSaveButton({ saving = false, isSearch = false, searching = false, isUpdate = false, disabled = false, custom = [] }) {

    let text = isUpdate ? "Update" : "Save";
    if (saving) {
        text = isUpdate ? "Updating..." : "Saving...";
    } else if (isSearch) {
        text = searching ? "Searching..." : "Search";
    }
    if (custom?.length === 3) {
        const [status, beforeSubmit, whileSubmit] = custom;
        text = status ? whileSubmit : beforeSubmit;
    }

    const busy = saving || searching || custom?.[0] === true;

    // `color="teal"` renders `bg-teal-500`, which globals.css already repaints
    // per theme (`[data-ui-theme] button.bg-teal-500`). So this stays teal on
    // Classic and takes the school's accent on every theme without an inline
    // colour here — an inline style would always win and would have frozen
    // Classic's own shade to whatever hex was hard-coded.
    return (
        <Button
            type="submit"
            color="teal"
            aria-busy={busy ? true : undefined}
            className={`rounded-lg normal-case text-sm font-semibold shadow-sm hover:shadow ${isSearch ? "min-w-[7.5rem]" : ""}`}
            disabled={disabled || saving || searching || custom?.[0] === true}
        >
            {busy
                // `inline-flex` on the inner span, not on the Button: Material
                // Tailwind owns the button's own class string and a display
                // change there fights its ripple wrapper.
                ? <span className="inline-flex items-center justify-center gap-2"><ButtonSpinner />{text}</span>
                : isSearch
                    ? <span className="inline-flex items-center justify-center gap-2"><MagnifyingGlassIcon className="h-4 w-4" aria-hidden="true" />{text}</span>
                    : text}
        </Button>
    )
}

export default FormSaveButton;
