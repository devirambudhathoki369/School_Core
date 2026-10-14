import { Section } from "@/components/sections";
import Checkbox from "@/components/inputs/Checkbox";

function LSResultFilters({ filters, onFilterChange }) {
    function onCheck(e) {
        const { name } = e.currentTarget;
        onFilterChange({ name, value: !!!filters?.[name] });
    }
    return (
        <Section title={"Result Specific Filters"} grid={false}>
            {/* Side by side, the same as the Filters card above it. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Checkbox inline name={"grade"} text={"Show/Hide Grade"} checked={filters?.grade}
                    onClick={onCheck} />
                <Checkbox inline name={"gp"} text={"Show/Hide G.P."} checked={filters?.gp}
                    onClick={onCheck} />
            </div>
        </Section>
    )
}

export const letterGradingFiltersSchema = { grade: true, gp: true }; // only specific to letter-grading.
export default LSResultFilters;