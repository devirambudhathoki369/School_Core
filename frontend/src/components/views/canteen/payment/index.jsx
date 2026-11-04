import { useCallback, useState } from "react";
import { Button } from "@material-tailwind/react";
import { ChevronLeftIcon } from "@heroicons/react/24/outline";

import { searchListViewOptions } from "@/components/searchbars/SearchListViews";
import StudentSearch from "@/components/searchbars/StudentSearch";
import { canteenClassSource, searchCanteenStudents } from "@/services/functions/canteen";
import { useCanteenScope } from "../common";
import CanteenProfile from "../profile";
import PayStudent from "./PayStudent";

// Module constants: the search form is memoised, and new props would redraw it.
const CLASS_PICKER = { source: canteenClassSource, handleAcademicYear: false };

function initialsOf(name) {
    const words = `${name || ""}`.trim().split(/\s+/).filter(Boolean);
    if (words.length < 1) return "?";
    return `${words[0][0] || ""}${words.length > 1 ? (words[words.length - 1][0] || "") : ""}`.toUpperCase();
}

const VIEWS = { SEARCH: "SEARCH", ACTION: "ACTION" };

/**
 * PAYMENT — the canteen's Payment > Student.
 *
 * The search is the school's own StudentSearch, the same component, reading the
 * canteen's endpoints: a canteen user's sign-in opens /canteen and nothing else.
 * Tap a card into Student ID No. and it finds them too. Then Pay or Profile.
 *
 * Pay opens the same screen a fee payment does: the ledger to tick titles from,
 * the guardian's lump sum to split, the payment form with its discount, the month,
 * and the trial balance beneath. The money and the receipt are the canteen's own,
 * numbered C-1, C-2…
 */
function CanteenPayment() {
    const { school, today, updateNotification } = useCanteenScope();
    const [view, setView] = useState(VIEWS.SEARCH);
    const [action, setAction] = useState("");
    const [selected, setSelected] = useState(null);
    // Coming back clears the form and reads the list again, with fresh balances.
    const [clearFormSignal, setClearFormSignal] = useState(0);

    const search = useCallback(async (filters) => {
        const answer = await searchCanteenStudents(filters);
        if (answer[0] !== 200) updateNotification(answer[0] || 400, answer[1] || "The search failed. Please try again.");
        return answer;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function onPick(pickedAction, id, classId, person) {
        setSelected(person);
        setAction(pickedAction);
        setView(VIEWS.ACTION);
    }

    return (
        <div className="w-full">
            <div className={view === VIEWS.SEARCH ? "" : "hidden"}>
                <StudentSearch onReset={() => null} onSelect={onPick} clearFormSignal={clearFormSignal}
                    searchListViewOption={searchListViewOptions.PAYMENT}
                    searchFn={search} classPickerProps={CLASS_PICKER} />
            </div>

            {view === VIEWS.ACTION && selected && (
                <div className="student-action-view w-full">
                    <Button className="app-back-btn flex items-center gap-1.5 w-max" variant="outlined" size="sm"
                        onClick={() => { setView(VIEWS.SEARCH); setClearFormSignal((s) => s + 1); }}>
                        <ChevronLeftIcon className="w-4 h-4" aria-hidden="true" />
                        Back to search
                    </Button>
                    {action === "pay" && (
                        <>
                            <div className="app-idpin bg-main">
                                <div className="app-idstrip flex items-center gap-3 px-4 py-3">
                                    <span className="app-avatar" aria-hidden="true">{initialsOf(selected.name)}</span>
                                    <div className="min-w-0">
                                        <p className="app-idstrip-name truncate">{selected.name}</p>
                                        {selected.detail && <p className="app-idstrip-sub capitalize">{selected.buyer_type === 1 ? "Class " : ""}{selected.detail}</p>}
                                    </div>
                                </div>
                            </div>
                            <PayStudent person={selected} school={school} today={today} updateNotification={updateNotification} />
                        </>
                    )}
                    {action === "profile" && <div className="px-3 pt-3"><CanteenProfile person={selected} embedded /></div>}
                </div>
            )}
        </div>
    );
}

export default CanteenPayment;
