import { SelectInput } from "@/components/inputs";
import Checkbox from "@/components/inputs/Checkbox";
import { Section } from "@/components/sections";

function ResultViewFilters({ filters, onFilterChange, isFinalResult = false, action = null }) {
    function onCheck(e) {
        // `currentTarget` is the toggle itself; `target` is whatever part of it
        // was under the pointer, and the words carry no name.
        const { name } = e.currentTarget;
        onFilterChange({ name, value: !!!filters?.[name] });
    }
    return (
        <Section title={"Filters"} grid={false}>
            {/* Was a flat 16-column grid, which gave every toggle a sixteenth of
                the width — unreadable on a laptop and far worse on a phone. The
                select keeps its own row; the toggles sit side by side and wrap
                only when they run out of room. `inline` is what makes that
                true: without it each toggle is sized full-width, and a row of
                full-width items is a column. */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-x-6 gap-y-3">
                <div className="sm:col-span-4 lg:col-span-3">
                    <SelectInput value={filters?.practical} onChange={onFilterChange}
                        input={{
                            name: 'practical', label: "Practical's alternative",
                            options: [{ name: 'In', value: 'In.' }, { name: 'Pr', value: 'Pr.' }]
                        }} />
                </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <Checkbox inline name={"autofill_roll_no"} text={"Auto fill Roll No."} checked={filters?.autofill_roll_no}
                    onClick={onCheck} description={"Shows generated roll numbers based on sorting. \"Overrides saved roll numbers!\""} />
                <Checkbox inline name={"roll_no"} text={"Show/Hide Roll No"} checked={filters?.roll_no}
                    onClick={onCheck} />
                <Checkbox inline name={"symbol_no"} text={"Show/Hide Symbol No"} checked={filters?.symbol_no}
                    onClick={onCheck} />
                <Checkbox inline name={"regd_no"} text={"Show/Hide Registration No"} checked={filters?.regd_no}
                    onClick={onCheck} />
                <Checkbox inline name={"birth_date"} text={"Show/Hide Birthdate"} checked={filters?.birth_date}
                    onClick={onCheck} />
                <Checkbox inline name={"subjectwise_result"} text={"Show/Hide Subjectwise"} checked={filters?.subjectwise_result}
                    onClick={onCheck} />
                <>
                    {
                        isFinalResult &&
                        <>
                            <Checkbox inline name={"termwise"} text={"Show/Hide Terminal Results"} checked={filters?.termwise}
                                onClick={onCheck} />
                        </>
                    }
                </>
            </div>
            {/* The action belongs with the form it acts on. Left on its own in a
                right-aligned row it ended up marooned at the far edge of a wide
                screen, nowhere near the controls it applies to. */}
            {action && (
                <div className="mt-4 pt-3 border-t border-blue-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-center gap-2">
                    {action}
                </div>
            )}
        </Section>
    )
}

export const filtersSchema = { practical: 'In.', autofill_roll_no: false, roll_no: true, symbol_no: '', regd_no: '', birth_date: false, subjectwise_result: true, termwise: true };
export default ResultViewFilters;