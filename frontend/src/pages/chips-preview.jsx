// LOCAL-ONLY, never committed. The choice chips exactly as the student search
// draws them (real SearchPanel, FilterSection, FilterItem), beside the real
// Search button, plus one of each state.  /chips-preview?theme=daylight
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import FilterItem from "@/components/inputs/FilterItem";
import { FilterSection } from "@/components/sections";
import SearchPanel from "@/components/searchbars/SearchPanel";

const LEVELS = ["Montessory", "School"];
const CLASSES = ["Play Group", "Nursery", "Lkg", "Ukg", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const STATES = [
    ["Plain", {}],
    ["Chosen", { isSelected: true }],
    ["Posted", { isWarned: true }],
    ["Posted chosen", { isWarned: true, isSelected: true }],
    ["Disabled", { isDisabled: true }],
    ["Disabled chosen", { isDisabled: true, isSelected: true }],
];

export default function ChipsPreview() {
    const { query } = useRouter();
    const [level, setLevel] = useState(2);
    const [grade, setGrade] = useState(null);
    const [days, setDays] = useState(["Sat"]);
    useEffect(() => {
        const theme = `${query.theme || "classic"}`;
        if (theme === "classic") document.documentElement.removeAttribute("data-ui-theme");
        else document.documentElement.setAttribute("data-ui-theme", theme);
    }, [query.theme]);
    return (
        <div className="p-4 max-w-5xl mx-auto flex flex-col gap-4 min-h-screen" style={{ background: "var(--t-canvas, #e4f1f3)" }}>
            <SearchPanel title="Search students" open onToggle={() => null}
                onSubmit={(e) => e.preventDefault()} onReset={() => { setLevel(null); setGrade(null); }}>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-y-3">
                    <div id="levels" className="sm:col-span-12">
                        <FilterSection title="Choose education level">
                            {LEVELS.map((label, i) => (
                                <FilterItem key={label} name="education_level" label={label} value={i + 1}
                                    selectedOption={level} onClick={({ value }) => setLevel(level === value ? null : value)} />
                            ))}
                        </FilterSection>
                    </div>
                    <div id="classes" className="sm:col-span-12">
                        <FilterSection title="Choose class">
                            {CLASSES.map((label, i) => (
                                <FilterItem key={label} name="grade" label={label} value={i + 1}
                                    selectedOption={grade} onClick={({ value }) => setGrade(grade === value ? null : value)} />
                            ))}
                        </FilterSection>
                    </div>
                </div>
            </SearchPanel>
            <div id="days" className="flex flex-wrap gap-2 rounded-xl bg-white p-4">
                {["Sun", "Mon", "Sat"].map((label) => {
                    const off = days.includes(label);
                    return (
                        <button key={label} type="button" aria-pressed={off}
                            data-selected={query.olddays ? undefined : (off ? "true" : undefined)}
                            onClick={() => setDays(off ? days.filter((d) => d !== label) : [...days, label])}
                            className={`app-filter-chip rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors
                                ${off ? "border-transparent bg-teal-500 text-white" : "border-blue-gray-200 bg-white text-gray-600 hover:border-blue-gray-300"}`}>
                            {label}
                        </button>
                    );
                })}
            </div>
            <div id="states" className="flex flex-wrap rounded-xl bg-white p-4">
                {STATES.map(([label, state], i) => (
                    <FilterItem key={label} name="state" label={label} value={i + 1} onClick={() => null} {...state} />
                ))}
            </div>
        </div>
    );
}
