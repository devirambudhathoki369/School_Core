import { CheckIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";
import { useEffect } from "react";

/**
 * One toggleable choice tile (education level, class, faculty, month…).
 *
 * Drawn as a square tile by `.app-filter-chip` in globals.css: white with a
 * real edge, and when chosen it turns into the theme's frame colour, lettered
 * in its highlight, with a tick. `aria-pressed` says the same to a screen
 * reader, which a colour change alone never did.
 */
function FilterItem({ label, name, value, selectedOption, isSelected, isDisabled, isWarned, title, onClick }) {
    value = parseInt(value);
    if (selectedOption) isSelected = selectedOption === value;
    useEffect(() => { }, [isSelected]);

    // `isWarned` marks a choice that is unusual but allowed — a month this class
    // has already been posted for, say. It has to stay clickable: greying it out
    // is what stopped schools billing a second fee title for a month they had
    // already billed the first one in. `data-warned` is what carries that state
    // into globals.css: the themed chip rules are `!important` on the accent, so
    // without it an already-posted month looked exactly like a fresh one on
    // every school running a theme.
    return (
        <Button
            disabled={isDisabled}
            title={title}
            aria-pressed={isSelected ? "true" : "false"}
            data-selected={isSelected ? "true" : undefined}
            data-warned={isWarned ? "true" : undefined}
            className={`app-filter-chip sm:col-span-2 flex items-center p-2 gap-4 text-black text-xs
            m-1 ${isWarned && !isSelected ? 'bg-amber-200 ring-1 ring-amber-400' : 'bg-teal-200'}
            ${isSelected ? `font-bold ${isWarned ? 'bg-amber-400 ring-1 ring-amber-500' : 'bg-teal-400'}` : ''}`}
            onClick={() => {
                onClick({ name, value });
            }}>
            {isSelected && <CheckIcon className="icon" strokeWidth={3} aria-hidden="true" />}
            {label}
        </Button>
    );
}

export default FilterItem;
