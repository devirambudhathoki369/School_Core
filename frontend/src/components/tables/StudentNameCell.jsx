import { memo } from "react";
import { PhoneIcon } from "@heroicons/react/24/outline";

/**
 * Name cell for the student payment list: shows the student's name with the
 * father's name and guardian's contact number stacked beneath it. Both are
 * optional — nothing renders for them when not entered.
 *
 * Receives the full row via `item` (BasicTable passes it to custom cells).
 */
const StudentNameCell = memo(function ({ data, item, highLighted = false }) {
    const fatherName = item?.father_name;
    const contact = item?.guardian_contact;
    return (
        <div className="flex flex-col px-2 leading-tight">
            <span className={`text-blue-gray-900 ${highLighted ? "font-bold" : "font-semibold"}`}>
                {data}
            </span>
            {fatherName ? (
                <span className="text-xs text-blue-gray-500">Father: {fatherName}</span>
            ) : null}
            {contact ? (
                <span className="inline-flex items-center gap-1 text-xs text-blue-gray-500"><PhoneIcon className="h-3 w-3" aria-hidden="true" />{contact}</span>
            ) : null}
        </div>
    );
});

export default StudentNameCell;
