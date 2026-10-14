import { CheckIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { Button, Tooltip } from "@material-tailwind/react";

// `inline` drops the full-width/grid-column sizing so a row of checkboxes can
// flow horizontally (each takes only the width it needs) instead of stacking.
//
// The words do not take the pointer: a click on them lands on the button, so
// `e.target.name` — which most callers read — is the toggle's name wherever it
// was clicked. Left to catch the click themselves, the words reported no name
// and the box simply did not tick, which a full-width toggle hid (most of it
// is empty button) and an inline one, being nearly all words, does not.
function Checkbox({ name, text, description = null, onClick, onBlur, checked = false, disabled = false, inline = false }) {
    return (
        <Button name={name || ""} disabled={disabled} onClick={onClick} onBlur={onBlur}
            className={`mt-1 flex gap-x-2 h-max ${inline ? "w-max px-2 py-1.5" : "sm:col-span-4 w-full"}`} variant="text">
            <div className="w-4 h-4 mr-1 border border-black rounded-sm pointer-events-none" >
                {checked && <CheckIcon strokeWidth={2} />}
            </div>
            <div className="flex justify-between items-center gap-x-2 pointer-events-none">
                <span>{text}</span>
                {description &&
                    <Tooltip content={description} className="whitespace-pre bg-blue-gray-500">
                        <InformationCircleIcon className="icon pointer-events-auto" />
                    </Tooltip>
                }
            </div>
        </Button>
    )
}

export default Checkbox;

/**
<Button onClick={() => {
    cloneData('guardian_contact', student?.guardian_contact, student.contact);
    // if (student?.guardian_contact) methods.onChange({ name: 'guardian_contact', value: '' });
    // else methods.onChange({ name: 'guardian_contact', value: student.contact });
}} className="mt-1 w-max flex items-center" variant="text">
    <div className="w-4 h-4 mr-1 border border-black rounded-sm" >
        {student.guardian_contact && <CheckIcon strokeWidth={2} />}
    </div>
    Same contact as above?
</Button>

// ---

<Button onClick={() => {
    cloneData('guardian_location', student?.guardian_location, student.location);
    // if (student?.guardian_location) methods.onChange({ name: 'guardian_location', value: '' });
    // else methods.onChange({ name: 'guardian_location', value: student.location });
}} className="mt-1 w-max flex items-center" variant="text">
    <div className="w-4 h-4 mr-1 border border-black rounded-sm" >
        {student.guardian_location && <CheckIcon strokeWidth={2} />}
    </div>
    Same location as above?
</Button>
 */