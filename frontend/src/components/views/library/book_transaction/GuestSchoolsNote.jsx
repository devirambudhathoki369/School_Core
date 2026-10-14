import { useEffect } from "react";
import { BuildingLibraryIcon } from "@heroicons/react/24/outline";

import { fetchGuestSchools } from "@/services/functions/library";

/**
 * Other schools whose students this library may serve — READ ONLY.
 *
 * This used to be an add/remove control on this page, which meant a school
 * could grant ITSELF the ability to look up another school's students. That
 * access exposes a different customer's records, so it is assigned by the
 * superadmin (Setup ▸ Library Access) and only reported here.
 *
 * It still loads the list, because the ids are the borrower search scope — and
 * saying so on the page is what stops "why is a student from another school
 * showing up?" becoming a support call.
 */
function GuestSchoolsNote({ schoolId, guestSchools, setGuestSchools }) {
    useEffect(() => {
        if (!schoolId) return;
        (async () => {
            const data = await fetchGuestSchools(schoolId);
            setGuestSchools(Array.isArray(data) ? data : []);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [schoolId]);

    if (!guestSchools?.length) return null;

    return (
        <div className="mb-2 flex items-start gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                style={{
                    backgroundColor: "color-mix(in srgb, var(--t-brand-solid, #0d9488) 13%, #fff)",
                    color: "var(--t-brand-solid, #0d9488)",
                }}>
                <BuildingLibraryIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
                <p className="text-[0.72rem] font-bold uppercase tracking-wider text-gray-500">
                    This library also serves
                </p>
                <p className="text-[0.95rem] font-semibold capitalize text-gray-800">
                    {guestSchools.map(g => g.school_name).filter(Boolean).join(", ")}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                    Students of these schools appear in the search below and can be issued books here.
                    Contact CentIT support to change this list.
                </p>
            </div>
        </div>
    );
}

export default GuestSchoolsNote;
