import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { Button } from "@material-tailwind/react";
import { useEffect } from "react";

/**
 * One toggleable filter chip (education level, faculty…).
 *
 * Classic keeps the teal-200/teal-400 chips it has always had. The
 * `app-filter-chip` hook is inert there and is what lets a theme repaint them
 * in its own accent (globals.css) — without it, the first row of every search
 * block stayed mint on a blue or green school, which was the loudest thing left
 * un-themed on those screens.
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
            data-selected={isSelected ? "true" : undefined}
            data-warned={isWarned ? "true" : undefined}
            className={`app-filter-chip sm:col-span-2 flex items-center p-2 gap-4 text-black text-xs
            m-1 ${isWarned && !isSelected ? 'bg-amber-200 ring-1 ring-amber-400' : 'bg-teal-200'}
            ${isSelected ? `font-bold ${isWarned ? 'bg-amber-400 ring-1 ring-amber-500' : 'bg-teal-400'}` : ''}`}
            onClick={() => {
                onClick({ name, value });
            }}>
            <>
                {isSelected ?
                    <MinusIcon className="icon" /> :
                    <PlusIcon className="icon" />}
            </>
            {label}
        </Button>
    );
}

export default FilterItem;
