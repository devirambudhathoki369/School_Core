import monthOptions from "@/components/inputs/options/months";
import FilterItem from "@/components/inputs/FilterItem";
import Checkbox from "@/components/inputs/Checkbox";
import { useEffect } from "react";

/**
 * 
 * @param {Array} data Array with months<int> where selected months are stored.
 * @param {Array} previousData Array of months<int> already stored in the database.
 * @param {'block'|'warn'} previousMode What `previousData` means for the picker.
 *   'block' (default) — the month cannot be chosen again. Right for salary
 *      posting, where a second posting of a month IS a duplicate.
 *   'warn' — the month is marked but stays selectable. Right for fee ledgers,
 *      where schools post one fee title at a time and a month billed for
 *      "Monthly Fee" must still be billable for "Exam Fee". Blocking those
 *      left 936 class/year groups unable to post ANY month at all.
 * @param {Array} blockedData Array of months<int> that cannot be posted at all —
 *   whatever `previousMode` says. A month where every fee title is either not
 *   payable or already billed to every student charges nothing, so selecting it
 *   can only write empty ledger rows. Marked AND unclickable.
 * @param {Function} onSelect Function which executes when the month is clicked, it gets access to values ({name:_, value: monthID}).
 * @param {Object} allMonths Object or state as `{pickedAllMonths: bool, setPickedAllMonths: ()=>{}}`.
 * @param {Function} onSelectAll returns all months except months in previousData as selected or unselected.
 * @returns React.Component
 */
function MonthPicker({ name = "month", data, previousData, blockedData, previousMode = 'block', onSelect, allMonths: { pickedAllMonths, setPickedAllMonths }, onSelectAll, allowAllMonthSelectAtOnce = true }) {
    const blocks = previousMode === 'block';
    function isBlocked(month) {
        return blockedData?.includes(month) || (blocks && previousData?.includes(month));
    }
    function handleSelectAll() {
        if (pickedAllMonths) {
            const _months = monthOptions.reduce((acc, val) => {
                if (!previousData?.includes(val.value) && !isBlocked(val.value)) acc.push(val.value);
                return acc;
            }, []);
            onSelectAll(_months);
        } else {
            onSelectAll([]);
        }
    }
    function onMonthSelect({ name, value }) {
        let _months = new Set(data);
        if (data.includes(value)) _months.delete(value);
        else _months.add(value);
        return onSelect({ name, value: Array.from(_months) });
    }
    // 
    useEffect(() => {
        handleSelectAll();
    }, [pickedAllMonths]);
    // 
    return (
        <div className="flex flex-col">
            <div className="flex flex-wrap">
                {monthOptions.map(option => {
                    const posted = previousData?.includes(option.value);
                    const blocked = isBlocked(option.value);
                    return (
                        <FilterItem key={option.value} name={name}
                            // TODO: FIX THIS; keep isSelected, remove selectedOption;
                            isDisabled={blocked}
                            isWarned={!blocks && posted}
                            title={blocked
                                ? "Nothing left to bill in this month — every fee title here is either already posted to every student or not payable in this period."
                                : (!blocks && posted
                                    ? "Already posted for this class — pick it only to bill a fee title it hasn't been billed yet. Nobody is charged the same title twice."
                                    : undefined)}
                            selectedOption={data?.includes(option.value) ? option.value : null}
                            label={option.name} value={option.value} onClick={onMonthSelect} />
                    );
                })}
            </div>
            {allowAllMonthSelectAtOnce &&
                <Checkbox onClick={() => {
                    setPickedAllMonths(state => !state);
                }} checked={pickedAllMonths} text={"All months?"} />
            }
        </div>
    )
}

export default MonthPicker;